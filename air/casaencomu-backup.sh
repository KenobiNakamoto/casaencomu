#!/bin/zsh
# Launched through ssh localhost, which must have Full Disk Access to the data volume and iCloud.
# Briefly stops the only writer; snapshots every database and retained photo; restarts before packing.
set -euo pipefail
umask 077
export PATH=/opt/homebrew/bin:$PATH COLIMA_HOME=/Volumes/Agents/colima
COMPOSE_FILE="${CASA_COMPOSE_FILE:-$HOME/srv/casaencomu/compose.yaml}"
DATA="${CASA_DATA_DIR:-/Volumes/TimeMachine/casaencomu}"
DEST="${CASA_BACKUP_DEST:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/casaencomu}"
PASS="${CASA_BACKUP_PASS:-$HOME/.config/casaencomu/backup.pass}"
TOOL="${CASA_BACKUP_TOOL:-$HOME/.local/lib/casaencomu/backup-tool.mjs}"
STATE="${CASA_BACKUP_STATE:-$HOME/.local/state/casaencomu}"
if [ "${1:-}" = "-n" ]; then
  echo '1. Check keys, tools, disk space and a running web container; acquire the backup lock.'
  echo '2. Stop web, snapshot databases and photos, verify them, restart web.'
  echo '3. Encrypt, restore and verify on the data volume; publish atomically; then prune old v2 copies.'
  exit 0
fi
[ -r "$TOOL" ] && [ -s "$PASS" ] && [ -r "$DATA/control.db" ] || { echo 'backup: tool, passphrase or data unavailable' >&2; exit 1; }
mkdir -p "$STATE" "$DEST"
mkdir "$STATE/backup.lock" || { echo 'backup: another operation holds the lock' >&2; exit 1; }
WORK="" PART="" STOPPED=0
cleanup() {
  local code=$?
  trap - EXIT
  if [ "$STOPPED" = 1 ]; then
    docker compose -f "$COMPOSE_FILE" start web || code=1
  fi
  [ -z "$PART" ] || rm -f "$PART"
  [ -z "$WORK" ] || rm -rf "$WORK"
  rmdir "$STATE/backup.lock"
  if [ "$code" -ne 0 ]; then
    printf '{"ok":false,"at":"%s"}\n' "$(date -u +%FT%TZ)" > "$STATE/backup-status.json.tmp"
    mv "$STATE/backup-status.json.tmp" "$STATE/backup-status.json"
    echo "$(date -u +%FT%TZ) ERROR backup failed; previous archives retained" >&2
  fi
  exit "$code"
}
trap cleanup EXIT
command -v node >/dev/null
command -v sqlite3 >/dev/null
CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q web)
[ -n "$CONTAINER" ] && [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = true ] || { echo 'backup: web is not running' >&2; exit 1; }
IMAGE=$(docker inspect -f '{{.Image}}' "$CONTAINER")
# Check both scratch and archive destinations. Never fill the disk to finish a backup.
node --input-type=module - "$DATA" "$DEST" <<'CHECK'
import { statfsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [data, dest] = process.argv.slice(2);
const bytes = Number(execFileSync('du', ['-sk', data], {encoding:'utf8'}).split(/\s/)[0]) * 1024;
for (const [path, needed] of [[data, bytes * 4 + 256*1024*1024], [dest, bytes * 2 + 512*1024*1024]]) {
  const s=statfsSync(path); if (s.bavail*s.bsize < needed) throw new Error('Insufficient backup space');
}
CHECK
WORK=$(mktemp -d "$DATA/.backup-XXXXXXXX")
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
OUT="$DEST/casa-$STAMP.casa2"
[ ! -e "$OUT" ] || { echo 'backup: output already exists' >&2; exit 1; }
STOPPED=1
docker compose -f "$COMPOSE_FILE" stop -t 30 web
node "$TOOL" snapshot "$DATA" "$WORK/snapshot" "$IMAGE"
docker compose -f "$COMPOSE_FILE" start web
STOPPED=0
node "$TOOL" pack "$WORK/snapshot" "$WORK/archive.casa2" "$PASS"
# Restore before publishing, on the external disk. No restored data touches the live directory.
node "$TOOL" restore "$WORK/archive.casa2" "$WORK/restore" "$PASS"
PART=$(mktemp "$DEST/.casa-$STAMP.XXXXXXXX")
cp "$WORK/archive.casa2" "$PART"
cmp -s "$WORK/archive.casa2" "$PART"
mv "$PART" "$OUT"
PART=""
printf '{"ok":true,"at":"%s"}\n' "$(date -u +%FT%TZ)" > "$STATE/backup-status.json.tmp"
mv "$STATE/backup-status.json.tmp" "$STATE/backup-status.json"
# Never prune the old v1 backups here. V2 keeps 31 daily days plus every first-of-month archive.
find "$DEST" -name 'casa-*.casa2' -mtime +31 ! -name 'casa-????-??-01T*.casa2' -delete
echo "$(date -u +%FT%TZ) ok $OUT"
