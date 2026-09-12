#!/bin/sh
# A local demonstration of the app, with no login in front of it.
#
# AUTH_DEV_EMAIL skips every door — ours, Cloudflare Access and the preview password — and it does
# so ONLY when NODE_ENV is development. `process.env.NODE_ENV` is inlined at build time, so the
# branch that reads this variable is dead code in the production image. It cannot leak to the Air.
#
# -H 127.0.0.1 is the important flag. `next dev` binds to every interface by default, which puts
# the family's 23 flats, their photographs and their ratings on whatever Wi-Fi this Mac is using,
# with no password. This binds to the loopback address, so only this Mac can reach it.
#
# To show it on a phone instead, run `./showcase.sh --lan` and read what it prints first.
set -e
cd "$(dirname "$0")"

PORT="${PORT:-3010}"
HOST=127.0.0.1

if [ "$1" = "--lan" ]; then
  HOST=0.0.0.0
  printf '\n  Every device on this network can now open the app, with no password.\n'
  printf '  Real listings, real photographs, real notes. Do not do this on a public network.\n'
  printf '  Ctrl-C now if that is not what you want.\n\n'
  sleep 4
fi

grep -q '^AUTH_DEV_EMAIL=.' .env.local 2>/dev/null || {
  echo "AUTH_DEV_EMAIL=demo@example.com" >> .env.local
  echo "wrote AUTH_DEV_EMAIL to .env.local"
}

exec pnpm dev -H "$HOST" -p "$PORT"
