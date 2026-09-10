#!/bin/zsh
# Nightly encrypted dump of every project database to iCloud Drive on the Air. docs/SCAFFOLD.md § 8.4.
# One archive per night: control.db plus one file per project. Restore: decrypt, then untar.
# Installed at ~/.local/bin/casaencomu-backup.sh; launched by com.kenobi.casaencomu-backup.plist through
# `ssh localhost` (launchd cannot read /Volumes). `-n` prints the three steps and exits 0, no side effects.
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH COLIMA_HOME=/Volumes/Agents/colima

COMPOSE_FILE="$HOME/srv/casaencomu/compose.yaml"
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/casaencomu"
PASS="$HOME/.config/casaencomu/backup.pass"
OUT="$DEST/casa-$(date +%F).tar.enc"

if [ "${1:-}" = "-n" ]; then
  echo "dry-run — would run:"
  echo "1. docker compose exec -T web sh -s  # VACUUM INTO /data/dump: control.db + one file per project"
  echo "2. docker compose exec -T web tar -cf - -C /data/dump . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass \"file:$PASS\" -out \"$OUT\""
  echo "3. find \"$DEST\" -name 'casa-*.tar.enc' -mtime +31 ! -name '*-01.tar.enc' -delete"
  exit 0
fi

[ -s "$PASS" ] || { echo "$(date '+%FT%T') ERROR: passphrase file $PASS is missing or empty — see docs/SCAFFOLD.md § 8.4" >&2; exit 1; }
mkdir -p "$DEST"

# Nothing here touches /Volumes. The data lives on an external disk, and macOS refuses that disk
# to an ssh session unless sshd has been given Full Disk Access — it answers EINTR, "Interrupted
# system call", which reads like a hardware fault and is not one. The container has the disk
# bind-mounted, so every read happens in there and only the encrypted stream crosses out into the
# home directory, which is never protected (issue #21, measured 2026-09-10).
#
# VACUUM INTO refuses an existing target, so the dump directory is emptied first. sqlite3 runs
# inside the container because it must take the same locks as the process that writes.
docker compose -f "$COMPOSE_FILE" exec -T web sh -s <<'INNER'
set -eu
rm -rf /data/dump
mkdir -p /data/dump
sqlite3 /data/control.db "VACUUM INTO '/data/dump/control.db'"
for d in /data/p/*/; do
  [ -f "$d/casa.db" ] || continue
  sqlite3 "$d/casa.db" "VACUUM INTO '/data/dump/$(basename "$d").db'"
done
INNER
# `exec -T` with no tty, so the tar stream crosses stdout unaltered. A `docker compose exec`
# without -T would insert a pseudo-terminal and corrupt every archive it ever wrote.
docker compose -f "$COMPOSE_FILE" exec -T web tar -cf - -C /data/dump . \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS" -out "$OUT"
docker compose -f "$COMPOSE_FILE" exec -T web rm -rf /data/dump
find "$DEST" -name 'casa-*.tar.enc' -mtime +31 ! -name '*-01.tar.enc' -delete
echo "$(date '+%FT%T') ok $OUT"
