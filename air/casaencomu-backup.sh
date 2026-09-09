#!/bin/zsh
# Nightly encrypted dump of every project database to iCloud Drive on the Air. docs/SCAFFOLD.md § 8.4.
# One archive per night: control.db plus one file per project. Restore: decrypt, then untar.
# Installed at ~/.local/bin/casaencomu-backup.sh; launched by com.kenobi.casaencomu-backup.plist through
# `ssh localhost` (launchd cannot read /Volumes). `-n` prints the three steps and exits 0, no side effects.
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH COLIMA_HOME=/Volumes/Agents/colima

COMPOSE_FILE="$HOME/srv/casaencomu/compose.yaml"
DATA=/Volumes/TimeMachine/casaencomu
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/casaencomu"
PASS="$HOME/.config/casaencomu/backup.pass"
OUT="$DEST/casa-$(date +%F).tar.enc"

if [ "${1:-}" = "-n" ]; then
  echo "dry-run — would run:"
  echo "1. docker compose exec -T web sh -s  # VACUUM INTO /data/dump: control.db + one file per project"
  echo "2. tar -cf - -C \"$DATA/dump\" . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass \"file:$PASS\" -out \"$OUT\""
  echo "3. find \"$DEST\" -name 'casa-*.tar.enc' -mtime +31 ! -name '*-01.tar.enc' -delete"
  exit 0
fi

[ -s "$PASS" ] || { echo "$(date '+%FT%T') ERROR: passphrase file $PASS is missing or empty — see docs/SCAFFOLD.md § 8.4" >&2; exit 1; }
mkdir -p "$DEST"

# VACUUM INTO refuses an existing target, so the dump directory is emptied first. sqlite3 runs
# inside the container because it must take the same locks as the process that writes.
rm -rf "$DATA/dump"
docker compose -f "$COMPOSE_FILE" exec -T web sh -s <<'INNER'
set -eu
mkdir -p /data/dump
sqlite3 /data/control.db "VACUUM INTO '/data/dump/control.db'"
for d in /data/p/*/; do
  [ -f "$d/casa.db" ] || continue
  sqlite3 "$d/casa.db" "VACUUM INTO '/data/dump/$(basename "$d").db'"
done
INNER
tar -cf - -C "$DATA/dump" . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS" -out "$OUT"
rm -rf "$DATA/dump"
find "$DEST" -name 'casa-*.tar.enc' -mtime +31 ! -name '*-01.tar.enc' -delete
echo "$(date '+%FT%T') ok $OUT"
