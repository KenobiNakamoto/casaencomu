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
