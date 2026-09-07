#!/bin/zsh
# Nightly encrypted dump of casa.db to iCloud Drive on the Air. docs/SCAFFOLD.md § 8.4.
# Installed at ~/.local/bin/casaencomu-backup.sh; launched by com.kenobi.casaencomu-backup.plist through
# `ssh localhost` (launchd cannot read /Volumes). `-n` prints the three steps and exits 0, no side effects.
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH COLIMA_HOME=/Volumes/Agents/colima

COMPOSE_FILE="$HOME/srv/casaencomu/compose.yaml"
DATA=/Volumes/TimeMachine/casaencomu
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/casaencomu"
PASS="$HOME/.config/casaencomu/backup.pass"
OUT="$DEST/casa-$(date +%F).db.enc"

if [ "${1:-}" = "-n" ]; then
  echo "dry-run — would run:"
  echo "1. docker compose -f \"$COMPOSE_FILE\" exec -T web sqlite3 /data/casa.db \"VACUUM INTO '/data/latest.db'\""
  echo "2. openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass \"file:$PASS\" -in \"$DATA/latest.db\" -out \"$OUT\""
  echo "3. find \"$DEST\" -name 'casa-*.db.enc' -mtime +31 ! -name '*-01.db.enc' -delete"
  exit 0
fi

[ -s "$PASS" ] || { echo "$(date '+%FT%T') ERROR: passphrase file $PASS is missing or empty — see docs/SCAFFOLD.md § 8.4" >&2; exit 1; }
mkdir -p "$DEST"

rm -f "$DATA/latest.db"   # VACUUM INTO refuses an existing target
docker compose -f "$COMPOSE_FILE" exec -T web sqlite3 /data/casa.db "VACUUM INTO '/data/latest.db'"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS" -in "$DATA/latest.db" -out "$OUT"
rm -f "$DATA/latest.db"
find "$DEST" -name 'casa-*.db.enc' -mtime +31 ! -name '*-01.db.enc' -delete
echo "$(date '+%FT%T') ok $OUT"
