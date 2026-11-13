# Files installed on the server

The server is the always-on Mac that runs the container. It holds **no checkout of this
repository**: `./deploy.sh` builds the image on the development Mac and loads it there over ssh.
Only a handful of things live on the server itself — `~/srv/casaencomu/compose.yaml`,
`~/srv/casaencomu/.env`, the files in this folder, and the browser reader described below.

Full procedure with the checks: `docs/SCAFFOLD.md` § 8.

## Backup v2 — deployed 2026-11-12

The nightly job now backs up **control.db, every registered project database, and all retained
photos**. It uses the existing passphrase file. The passphrase stays in the family's password
manager; no new password was created. Old `.tar.enc` backups remain readable with the older
OpenSSL procedure. New `.casa2` files use AES-256-GCM with a random salt/IV and scrypt-derived key.

`casaencomu-backup.sh` performs these steps:

1. Acquire a lock, check tools, the running container, passphrase and available space.
2. Stop the app, snapshot SQLite files and photos on the data volume, then restart the app.
3. Validate SQLite integrity, foreign keys, schema versions, table counts, file hashes and every
   photo reference. Encrypt the snapshot and restore it into a separate temporary directory.
4. Copy the verified ciphertext to a temporary file beside the destination. Check the copy and
   rename it to the final filename. Only then prune v2 archives older than 31 days; keep monthly copies.

The app is paused only for the snapshot. A failure restarts it and retains previous archives.
A lock prevents overlap. An abrupt host shutdown can still interrupt maintenance; check service
state after restarting the machine. The archive contains credentials and private data: keep the
passphrase and decrypted restores private. Never restore over a running data directory.

Install the helper and wrapper together:

```sh
ssh air 'mkdir -p ~/.local/lib/casaencomu'
scp air/ops/backup-tool.mjs air:.local/lib/casaencomu/
scp air/casaencomu-backup.sh air:.local/bin/
ssh air 'chmod 700 ~/.local/bin/casaencomu-backup.sh; ~/.local/bin/casaencomu-backup.sh -n'
```

The existing `com.kenobi.casaencomu-backup` LaunchAgent runs at 03:30 through `ssh localhost`.
That SSH session must have Full Disk Access to the data volume and iCloud Drive. **Measured on
2026-11-12:** direct SQLite reads through SSH work, and the new job completed through the actual
LaunchAgent with exit status 0. Older notes about denied host reads no longer describe this setup.
A future permission change causes an explicit failure; it must not produce an incomplete archive.

The default scratch location is the external data volume. Do not move restore tests to the small
internal disk. `CASA_DATA_DIR`, `CASA_BACKUP_DEST`, `CASA_BACKUP_PASS`, `CASA_BACKUP_TOOL`,
`CASA_COMPOSE_FILE` and `CASA_BACKUP_STATE` override the paths for an isolated test.

### Restore and rollback

```sh
# On the Air. NEW_DIRECTORY must not exist. Use a separate directory on the external volume.
node ~/.local/lib/casaencomu/backup-tool.mjs restore ARCHIVE.casa2 NEW_DIRECTORY \
  ~/.config/casaencomu/backup.pass
node ~/.local/lib/casaencomu/backup-tool.mjs verify NEW_DIRECTORY
```

Restore checks the GCM authentication tag before extracting any file. It refuses traversal,
symlinks, special entries, an existing destination, changed file hashes and missing photos.
The manifest records the source image ID and every database's schema version and table counts.
The container runs as UID 1000; ensure the restored mount is readable and writable by that UID.
Test this in an isolated container before a live switch.

`deploy.sh` uses unique image tags, an HTTPS/configuration preflight, a deployment lock and a
verified pre-deploy backup. To deploy an already tested image, set `CASA_RELEASE_TAG` and
`CASA_PREBUILT_IMAGE_ID`; the script refuses an ID mismatch. A prepared `.env.ready` is validated
before use. It keeps the previous image, compose file, private environment and exact backup path
in `~/srv/casaencomu/releases/<tag>/`. Do not reuse a release directory.

For a rollback after a migration:

1. Stop the new app. Preserve its data separately; a pre-deploy restore discards later writes.
2. Restore the recorded backup into a new sibling directory and verify it.
3. Test the retained `casaencomu-web:before-<tag>` image against that restored directory.
4. Replace the data mount only after checking the lost-write window. Keep the failed data copy.
5. Restore the previous compose/environment, pin the retained image, and start the service.
6. Check HTTPS, login, property counts and retained photos. Never run an older image blindly
   against migrated data. There is no automatic destructive rollback.

**Live drill, 2026-11-12:** restored 24 properties and 657 photos. The new image migrated the copy
from schema 9 to 10. A fictional account completed setup, login, one-time recovery and logout over
HTTPS. A second restored copy booted with the previous image at schema 9, with all counts intact.
Neither restore replaced production data. Test containers and copies were removed afterwards.

### HTTPS and monitoring

Use the Air's Tailscale HTTPS name for `PUBLIC_URL`, including a non-default port if used.
Tailscale Serve on the Air proxies port 443 to `127.0.0.1:3100`. This is tailnet-only. The old HTTP
8080 endpoint was removed after HTTPS verification. The public custom domain is still unpublished.
Production cookies remain Secure; do not weaken them to accommodate HTTP.

`air/ops/deployment-check.mjs` refuses HTTP origins, preview identity bypasses, incomplete Access
settings and placeholder credentials. First setup also requires the private operator key.

Compose now probes `/api/health`. The probe reads actual tables, checks the data directory's free
space and reads a retained-photo sample. Full integrity/photo checks happen in each backup.
`check-service.mjs` additionally checks backup success/freshness and internal/data volume space.
Its hourly LaunchAgent writes `~/Library/Logs/casaencomu-monitor.log` and exits nonzero on failure.
This is local operator monitoring; **no email/push notification channel is configured**.

```sh
ssh air 'PATH=/opt/homebrew/bin:$PATH node ~/.local/lib/casaencomu/check-service.mjs'
ssh air 'tail -5 ~/Library/Logs/casaencomu-monitor.log'
ssh air 'cat ~/.local/state/casaencomu/backup-status.json'
```

The internal disk had less than 1 GB free during deployment. The monitor reports this condition.
Backup preflight requires room for its destination copy plus a reserve and will fail before filling
the disk. Free internal space or confirm iCloud eviction before depending on long-term retention.
All three new archives were confirmed uploaded to iCloud. An attempt to release two redundant
local copies through Apple’s `evictUbiquitousItem(at:)` API was refused by File Provider. No archive
was deleted, and no unrelated files were removed. The next backup can fail the space preflight
until internal capacity is restored.

## `capture-agent.mjs` — the browser reader

`scripts/capture-agent.mjs` in this repository, copied to the server as
`~/.local/bin/casaencomu-reader.mjs`. It is the only part of the system that is **not** in the
container, because a container cannot drive a browser and Idealista answers a server fetch with a
DataDome challenge every time. It asks the app which links are still unread, opens each one in a
stock Chrome with its own empty profile, runs the same collector the bookmarklet carries, and
posts the result back to `/api/capture`.

Nothing about it defeats the challenge. It is an ordinary Chrome, headful, with no flag that
changes what a site sees: the challenge's own JavaScript runs, passes, and the advertisement
loads — measured at about 700 ms. One page at a time, five seconds apart, and only pages a member
pasted into the app. No proxy, no fingerprint, no CAPTCHA. Without it nothing breaks: the link is
still saved, and the bookmarklet still reads the page by hand.

```sh
scp scripts/capture-agent.mjs air:.local/bin/casaencomu-reader.mjs
ssh air 'mkdir -p ~/.config/casaencomu && chmod 700 ~/.config/casaencomu'
# the token is any member's capture_token — /ayuda shows it inside their bookmarklet
ssh air 'cat > ~/.config/casaencomu/reader.env' <<EOF
export CASA_URL=http://127.0.0.1:3100
export CASA_CAPTURE_TOKEN=…
EOF
ssh air 'chmod 600 ~/.config/casaencomu/reader.env'
ssh air 'CASA_URL=http://127.0.0.1:3100 CASA_CAPTURE_TOKEN=… node ~/.local/bin/casaencomu-reader.mjs --once'
```

`--once` does a single pass and exits, which is the check: it prints one line per link it read.

## `com.kenobi.casaencomu-reader.plist`

The LaunchAgent that keeps the reader running.

```sh
scp air/com.kenobi.casaencomu-reader.plist air:Library/LaunchAgents/
ssh air 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kenobi.casaencomu-reader.plist'
ssh air 'tail -f ~/Library/Logs/casaencomu-reader.log'
```

It is a LaunchAgent, not a Daemon: Chrome is headful and needs the logged-in GUI session. If the
server is ever left at the login window, the reader stops working and every link simply stays
unread until it comes back — which is the failure mode this was designed to have.

## `ai-bridge.mjs` — the fill layers, without an API key

`scripts/ai-bridge.mjs` in this repository, copied to the server as
`~/.local/bin/casaencomu-ai-bridge.mjs`. Layers 2 and 3 need a model; the server already has the
Claude Code CLI, signed in, so it needs no API key. The bridge is what lets the container use it:
it answers `POST /v1/messages` in the Anthropic Messages shape by running `claude -p` in a
temporary directory of its own.

It runs on the host for the same reason the reader does — the CLI's credentials are in the login
Keychain, which is not in the image. Nothing about the fill layers moves out here: the prompts,
the range guards and the `deducido` marks all stay in `src/lib/enrich.ts`.

```sh
scp scripts/ai-bridge.mjs air:.local/bin/casaencomu-ai-bridge.mjs
ssh air 'mkdir -p ~/.config/casaencomu && chmod 700 ~/.config/casaencomu'
# one secret, used twice: here, and as ANTHROPIC_API_KEY in ~/srv/casaencomu/.env
ssh air 'cat > ~/.config/casaencomu/ai.env' <<'EOF'
export CASA_AI_TOKEN=…
EOF
ssh air 'chmod 600 ~/.config/casaencomu/ai.env'
ssh air '. ~/.config/casaencomu/ai.env && PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH node ~/.local/bin/casaencomu-ai-bridge.mjs'
```

In another terminal, the check — it should print the three fields that are in the text and `null`
for the one that is not:

```sh
ssh air 'curl -s -XPOST http://127.0.0.1:8788/v1/messages -H "x-api-key: …" -H "content-type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"78 m2, 3 habitaciones, 245.000 EUR\"}]}],\"tools\":[{\"name\":\"c\",\"input_schema\":{\"type\":\"object\",\"properties\":{\"price_eur\":{},\"area_m2\":{},\"rooms\":{},\"energy_rating\":{}}}}]}"'
```

Then the app's own `.env` — `ANTHROPIC_API_KEY` is the same secret, not a key:

```sh
ssh air 'printf "ANTHROPIC_API_KEY=…\nAI_BASE_URL=http://host.docker.internal:8788\n" >> ~/srv/casaencomu/.env'
./deploy.sh          # compose.yaml carries the extra_hosts line that makes that name resolve
```

The bridge listens on every interface, because the container reaches it through the Docker
gateway rather than through loopback. `CASA_AI_TOKEN` is what keeps the rest of the network out,
so it is a long random string and it is checked before anything is run.

## `com.kenobi.casaencomu-ai.plist`

The LaunchAgent that keeps the bridge running.

```sh
scp air/com.kenobi.casaencomu-ai.plist air:Library/LaunchAgents/
ssh air 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kenobi.casaencomu-ai.plist'
ssh air 'tail -f ~/Library/Logs/casaencomu-ai.log'
```

One line per request: the layer, how many photographs went with it, how long it took, and which
fields came back. A layer that finds nothing prints `nada`, which is an ordinary answer.

If the bridge is not running, the app behaves exactly as it did before it existed: layers 2 and 3
are skipped, no source is marked as done, and everything waiting is filled when it comes back.
