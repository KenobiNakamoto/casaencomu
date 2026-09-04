#!/bin/zsh
# Build on this Mac (arm64, like the Air), ship the image over ssh, start it there. SCAFFOLD.md § 7.
# `air` is an ssh alias from ~/.ssh/config; the Air's real hostname never appears here.
set -euo pipefail
cd "$(dirname "$0")"

ssh air 'test -f ~/srv/casaencomu/.env' || { echo "deploy: ~/srv/casaencomu/.env is missing on the Air — create it first (SCAFFOLD.md § 8.3)" >&2; exit 1; }
ssh air 'docker compose version >/dev/null 2>&1' || { echo "deploy: 'docker compose' is not available on the Air — install the compose plugin first" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "deploy: no Docker daemon on this Mac — start Docker Desktop (or colima start)" >&2; exit 1; }

docker build --platform linux/arm64 -t casaencomu-web:latest .
docker save casaencomu-web:latest | gzip | ssh air 'gunzip | docker load'
ssh air 'mkdir -p ~/srv/casaencomu && chmod 700 ~/srv/casaencomu'
scp compose.yaml air:srv/casaencomu/compose.yaml
ssh air 'cd ~/srv/casaencomu && docker compose up -d'

# Health: the container needs a moment to listen; retry for ~20 s.
ssh air 'for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf http://127.0.0.1:3100/api/health && echo && exit 0; sleep 2; done; echo "deploy: /api/health did not answer on 127.0.0.1:3100" >&2; cd ~/srv/casaencomu && docker compose ps; exit 1'
