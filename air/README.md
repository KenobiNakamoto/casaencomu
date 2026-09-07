# Files installed on the server

The server is the always-on Mac that runs the container. It holds **no checkout of this
repository**: `./deploy.sh` builds the image on the development Mac and loads it there over ssh.
Only three things live on the server itself — `~/srv/casaencomu/compose.yaml`,
`~/srv/casaencomu/.env`, and the two files in this folder.

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
