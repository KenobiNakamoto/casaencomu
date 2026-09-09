# Files installed on the server

The server is the always-on Mac that runs the container. It holds **no checkout of this
repository**: `./deploy.sh` builds the image on the development Mac and loads it there over ssh.
Only a handful of things live on the server itself — `~/srv/casaencomu/compose.yaml`,
`~/srv/casaencomu/.env`, the files in this folder, and the browser reader described below.

Full procedure with the checks: `docs/SCAFFOLD.md` § 8.

## `casaencomu-backup.sh`

The nightly backup. It asks SQLite for a consistent copy (`VACUUM INTO`), encrypts it with a
passphrase read from a file, writes it to iCloud Drive, and keeps 31 daily copies plus the first
of each month. `-n` prints the three steps and exits without doing anything.

```sh
scp air/casaencomu-backup.sh air:.local/bin/
ssh air 'chmod +x ~/.local/bin/casaencomu-backup.sh && ~/.local/bin/casaencomu-backup.sh -n'
```

The passphrase file is created once, by hand, and the passphrase goes into the password manager
in the same minute. Without it the backups are unreadable noise. Photos are not backed up: they
can be downloaded again while the advertisement is alive.

## `com.kenobi.casaencomu-backup.plist`

The LaunchAgent that runs the script at 03:00.

```sh
scp air/com.kenobi.casaencomu-backup.plist air:Library/LaunchAgents/
ssh air 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kenobi.casaencomu-backup.plist'
ssh air 'tail -3 ~/Library/Logs/casaencomu-backup.log'
```

It does not run the script directly. `launchd` cannot read `/Volumes`, where the data lives, so
the agent goes through `ssh localhost`, which inherits the ssh daemon's full-disk access. That
detour is the reason this file looks stranger than it should.

A restore has to be practised before it is needed:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in casa-<date>.db.enc -out /tmp/casa.db -pass file:<passphrase file>
sqlite3 /tmp/casa.db 'select count(*) from properties;'
```

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
