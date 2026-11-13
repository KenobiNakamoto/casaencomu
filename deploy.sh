#!/bin/zsh
# Build and ship a unique image. Back up the old data first; never overwrite the rollback image.
set -euo pipefail
cd "$(dirname "$0")"
TAG="${CASA_RELEASE_TAG:-$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)}"
[[ "$TAG" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || { echo 'Invalid release tag' >&2; exit 1; }
IMAGE="casaencomu-web:$TAG"
ssh air 'test -f ~/srv/casaencomu/.env && test -x ~/.local/bin/casaencomu-backup.sh && docker compose version >/dev/null' || { echo 'deploy: server prerequisites missing' >&2; exit 1; }
docker info >/dev/null
# Keep build evidence beside the release. The deployed image is pinned by its unique tag and ID.
mkdir -p "_local/releases/$TAG"
if [ -n "${CASA_PREBUILT_IMAGE_ID:-}" ]; then
  [ "$(docker image inspect -f '{{.Id}}' "$IMAGE")" = "$CASA_PREBUILT_IMAGE_ID" ] || { echo 'deploy: tested image ID mismatch' >&2; exit 1; }
else
  docker build --platform linux/arm64 -t "$IMAGE" .
fi
docker image inspect -f '{{.Id}}' "$IMAGE" > "_local/releases/$TAG/image.txt"
docker save "$IMAGE" | gzip | ssh air 'gunzip | docker load'
ssh air "mkdir -p ~/srv/casaencomu/releases && mkdir ~/srv/casaencomu/releases/$TAG && chmod 700 ~/srv/casaencomu/releases/$TAG"
scp compose.yaml "air:srv/casaencomu/releases/$TAG/compose.yaml"
scp air/ops/deployment-check.mjs "air:srv/casaencomu/releases/$TAG/deployment-check.mjs"
# The preflight is read-only. Backup failure stops deployment before any image/config switch.
ssh air "/bin/zsh -s -- '$TAG'" <<'REMOTE'
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH COLIMA_HOME=/Volumes/Agents/colima
cd ~/srv/casaencomu
TAG="$1"
mkdir deployment.lock || { echo 'deploy: another deployment holds the lock' >&2; exit 1; }
trap 'rmdir deployment.lock' EXIT
ENVFILE=.env
[ ! -f .env.ready ] || ENVFILE=.env.ready
node "releases/$TAG/deployment-check.mjs" "$ENVFILE"
COUNT=$(sqlite3 -readonly /Volumes/TimeMachine/casaencomu/control.db 'SELECT count(*) FROM accounts;')
if [ "$COUNT" = 0 ]; then
  node --input-type=module - "$PWD/$ENVFILE" "$PWD/releases/$TAG/deployment-check.mjs" <<'CHECK'
const {readEnv}=await import(process.argv[3]);
if((readEnv(process.argv[2]).CASA_SETUP_TOKEN??'').length<32) throw new Error('First setup requires an operator key');
CHECK
fi
# A valid certificate on the configured origin must already lead to this app.
ORIGIN=$(node --input-type=module - "$PWD/$ENVFILE" "$PWD/releases/$TAG/deployment-check.mjs" <<'ORIGIN'
const {readEnv,checkDeployment}=await import(process.argv[3]); console.log(checkDeployment(readEnv(process.argv[2])));
ORIGIN
)
curl --fail --silent --show-error --max-time 15 "$ORIGIN/api/health" >/dev/null
~/.local/bin/casaencomu-backup.sh
OLD=$(docker compose ps -q web)
docker inspect -f '{{.Image}}' "$OLD" > "releases/$TAG/previous-image.txt"
docker image tag "$(cat "releases/$TAG/previous-image.txt")" "casaencomu-web:before-$TAG"
cp compose.yaml "releases/$TAG/previous-compose.yaml"
cp .env "releases/$TAG/previous.env"
chmod 600 "releases/$TAG/previous.env"
[ "$ENVFILE" = .env ] || mv "$ENVFILE" .env
# Record the exact verified backup corresponding to the old image.
find "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/casaencomu" -name 'casa-*.casa2' | sort | tail -1 > "releases/$TAG/backup-path.txt"
cp "releases/$TAG/compose.yaml" compose.yaml
# Persist the image selection for unattended restarts, without losing existing environment values.
node --input-type=module - .env "$TAG" <<'ENV'
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
const [file,tag]=process.argv.slice(2);
const text=readFileSync(file,'utf8').replace(/^CASA_IMAGE=.*\n?/gm,'');
writeFileSync(file+'.tmp',text.trimEnd()+'\nCASA_IMAGE=casaencomu-web:'+tag+'\n',{mode:0o600}); renameSync(file+'.tmp',file);
ENV
docker compose up -d --no-build
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null && curl -fsS --max-time 5 "$ORIGIN/api/health" >/dev/null; then
    echo "deploy: healthy release $TAG; rollback assets in releases/$TAG"
    exit 0
  fi
  sleep 2
done
echo "deploy: health failed. Rollback image and pre-migration backup retained in releases/$TAG. Do not downgrade migrated data blindly; follow air/README.md." >&2
exit 1
REMOTE
