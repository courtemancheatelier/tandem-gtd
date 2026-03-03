# Tandem GTD — Backup & Disaster Recovery Guide

This guide covers setting up, operating, and restoring from Tandem's backup system. It's written for anyone administering a self-hosted Tandem instance on bare-metal Linux (Ubuntu 22.04/24.04).

---

## Quick Reference

| Task | Command |
|------|---------|
| Run daily backup now | `./scripts/backup.sh` |
| Run weekly full backup | `./scripts/backup.sh --full` |
| Check backup health | `./scripts/dr-status.sh` |
| Restore latest backup | `sudo ./scripts/dr-restore.sh latest` |
| Restore specific file | `sudo ./scripts/dr-restore.sh --from backups/daily/file.gpg` |
| Restore to point-in-time | `sudo ./scripts/dr-restore.sh --pitr "2026-02-21 15:46:00"` |
| Restore single table | `sudo ./scripts/dr-restore.sh --table Task --from backups/daily/file.gpg` |
| Verify latest backup | `./scripts/dr-verify.sh` |
| Configure off-site targets | `./scripts/setup-offsite.sh` |
| View logs | `cat backups/dr.log` |

---

## 1. What Gets Backed Up

### Daily Snapshot (default: 2:00 AM)

- Full PostgreSQL database dump (`pg_dump --format=custom`)
- Encrypted with AES-256 (GPG symmetric)
- SHA-256 checksum for integrity verification
- Retention: 30 snapshots (configurable)

### Weekly Full-System Archive (default: Sunday 3:00 AM)

Everything in the daily snapshot, plus:
- `.env` (your configuration and secrets)
- `prisma/` directory (schema + migration history)
- `tandem.service` (systemd unit file)
- PostgreSQL backup config (if WAL is enabled)
- All bundled into a single encrypted `.tar.gz.gpg`
- Retention: 12 archives (configurable, ~3 months)

### WAL Archiving (optional, for point-in-time recovery)

- PostgreSQL Write-Ahead Log segments archived continuously
- Weekly base backup as PITR anchor (`pg_basebackup`)
- Enables recovery to any point in time within the retention window
- Retention: 14 days of WAL + base backups

---

## 2. Initial Setup

### Prerequisites

- PostgreSQL 14+ running locally
- `gpg` installed (`sudo apt install gnupg`)
- Tandem `.env` file configured

### Step 1: Set the Backup Passphrase

Add `BACKUP_PASSPHRASE` to your `.env` file. Generate a strong one:

```bash
openssl rand -base64 48
```

```env
# .env
BACKUP_PASSPHRASE="your-generated-passphrase-here"
```

**CRITICAL:** Store this passphrase somewhere safe that is NOT on this server. If you lose it, your backups are unrecoverable. Put it in a password manager, print it, or store it on a separate device.

### Step 2: Configure PostgreSQL Access

The backup scripts use `sudo -u postgres` for database operations (peer authentication). Verify it works:

```bash
sudo -u postgres pg_dump --dbname=tandem --format=custom --file=/dev/null
```

If your setup uses password auth instead, create a `.pgpass` file:

```bash
echo "localhost:5432:tandem:tandem:YOUR_DB_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
```

### Step 3: Set Up the Sudoers Entry

The `tandem` user needs permission to run backup commands:

```bash
sudo tee /etc/sudoers.d/tandem-backup << 'EOF'
tandem ALL=(postgres) NOPASSWD: /usr/bin/pg_dump, /usr/bin/pg_restore, /usr/bin/pg_basebackup, /usr/bin/psql, /usr/bin/createdb, /usr/bin/dropdb
tandem ALL=(root) NOPASSWD: /usr/bin/systemctl stop tandem, /usr/bin/systemctl start tandem, /usr/bin/systemctl restart tandem
tandem ALL=(root) NOPASSWD: /usr/bin/systemctl stop postgresql, /usr/bin/systemctl start postgresql, /usr/bin/systemctl restart postgresql
EOF
sudo chmod 440 /etc/sudoers.d/tandem-backup
```

### Step 4: Run Your First Backup

```bash
./scripts/backup.sh
```

You should see output like:

```
[INFO] Starting daily database backup...
[OK]   Daily backup complete: tandem_20260222_140000.pg_dump.gpg (2.1M)
[OK]   Backup complete.
```

### Step 5: Verify It Works

```bash
./scripts/dr-verify.sh
```

This decrypts the backup, restores it into a throwaway database, validates row counts, and cleans up. If it says `PASSED`, you're good.

### Step 6: Install the Cron Schedule

```bash
crontab -e
```

Add:

```cron
# Tandem GTD — Disaster Recovery Schedule
# Daily database snapshot (2:00 AM)
0 2 * * *   /opt/tandem/scripts/backup.sh --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Weekly full-system snapshot (Sunday 3:00 AM)
0 3 * * 0   /opt/tandem/scripts/backup.sh --full --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Weekly WAL base backup (Sunday 4:00 AM) — only runs if WAL enabled
0 4 * * 0   /opt/tandem/scripts/wal-basebackup.sh --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Weekly automated restore verification (Sunday 4:30 AM)
30 4 * * 0  /opt/tandem/scripts/dr-verify.sh --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log
```

---

## 3. Enabling WAL (Point-in-Time Recovery)

WAL archiving lets you restore to any specific moment — not just the last nightly snapshot. Useful for "I deleted a project at 3:47 PM, roll back to 3:46 PM" scenarios.

### Step 1: Enable in .env

```env
BACKUP_WAL_ENABLED=true
```

### Step 2: Configure PostgreSQL

Create a drop-in config file (no editing of main `postgresql.conf`):

```bash
sudo tee /etc/postgresql/16/main/conf.d/tandem-backup.conf << 'EOF'
wal_level = replica
archive_mode = on
archive_command = '/opt/tandem/scripts/archive-wal.sh %p %f'
archive_timeout = 300
max_wal_size = 256MB
min_wal_size = 64MB
checkpoint_completion_target = 0.9
EOF
```

### Step 3: Restart PostgreSQL

```bash
sudo systemctl restart postgresql
```

### Step 4: Take a Base Backup

```bash
./scripts/wal-basebackup.sh
```

WAL archiving is now active. PostgreSQL will call `archive-wal.sh` to compress and store each WAL segment as it completes.

### Storage Estimate

A single-user Tandem instance generates minimal WAL — roughly 16-50 MB/day. Base backups are similarly small (a personal GTD database is megabytes, not gigabytes). Total WAL storage for a 14-day window: ~1-2 GB.

---

## 4. Off-Site Replication

Local backups protect against accidental deletion and bad migrations. Off-site backups protect against disk failure, ransomware, and server compromise.

Run the interactive wizard:

```bash
./scripts/setup-offsite.sh
```

### Option A: rsync to Another Server

Simplest if you have a second VPS, home server, or friend's machine. Uses SSH key auth and incremental transfers.

```env
BACKUP_RSYNC_ENABLED=true
BACKUP_RSYNC_TARGET=user@backup-server:/backups/tandem
BACKUP_RSYNC_SSH_KEY=~/.ssh/id_tandem_backup
BACKUP_RSYNC_BANDWIDTH_LIMIT=0
```

**Tip:** Restrict the SSH key on the remote server with `command=` in `authorized_keys` to limit what it can do.

### Option B: S3-Compatible Storage

Works with Backblaze B2 ($0.005/GB/mo), AWS S3, MinIO, or Wasabi. Requires the `aws` CLI.

```env
BACKUP_S3_ENABLED=true
BACKUP_S3_BUCKET=tandem-backups
BACKUP_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
BACKUP_S3_ACCESS_KEY=your-key
BACKUP_S3_SECRET_KEY=your-secret
BACKUP_S3_REGION=us-west-000
```

**Tip:** Use a dedicated application key with write-only permissions. No delete permissions protects against ransomware deleting your backups.

### Option C: rclone

Supports 70+ backends: Google Drive, Dropbox, OneDrive, SFTP, etc. Install with `curl https://rclone.org/install.sh | sudo bash`, then run `rclone config`.

```env
BACKUP_RCLONE_ENABLED=true
BACKUP_RCLONE_REMOTE=gdrive:tandem-backups
BACKUP_RCLONE_BANDWIDTH_LIMIT=0
```

### Triggering Replication

Off-site replication runs automatically after each backup. To run it manually:

```bash
./scripts/replicate-offsite.sh
```

---

## 5. Restoring from Backup

### Scenario: "Something broke, get me back to last night"

```bash
sudo ./scripts/dr-restore.sh latest
```

This stops Tandem, finds the most recent daily snapshot, verifies the checksum, decrypts, restores into PostgreSQL, runs a sanity check, and restarts the app.

### Scenario: "I need to go back to 3:46 PM yesterday"

Requires WAL archiving to be enabled (see section 3).

```bash
sudo ./scripts/dr-restore.sh --pitr "2026-02-21 15:46:00"
```

This stops both Tandem and PostgreSQL, restores the base backup, replays WAL segments up to the target time, then restarts everything. Your current data directory is preserved as a safety net at `/var/lib/postgresql/16/main.pre-pitr`.

### Scenario: "I just deleted all my Someday/Maybe items"

```bash
sudo ./scripts/dr-restore.sh --table SomedayMaybe \
    --from backups/daily/tandem_20260221_020000.pg_dump.gpg
```

Restores only the specified table from a backup. Everything else stays untouched.

### Scenario: "My server is gone, I have a fresh Ubuntu box"

1. Install PostgreSQL 16 and Node.js 20
2. Clone the Tandem repo
3. Copy your encrypted backup (from off-site storage) to the server
4. Run setup:

```bash
./scripts/setup-local.sh
```

5. Restore:

```bash
sudo ./scripts/dr-restore.sh --from /path/to/your/backup.gpg
```

---

## 6. Monitoring Backup Health

### Status Dashboard

```bash
./scripts/dr-status.sh
```

Shows:
- Last daily/weekly backup time and age
- Snapshot counts vs retention limits
- WAL archiving status and segment count
- Off-site replication status
- Last verification result
- Encryption and service status

For machine-readable output (useful for future admin panel integration):

```bash
./scripts/dr-status.sh --json
```

### Log Files

| File | Contents |
|------|----------|
| `backups/dr.log` | All backup/restore/replication operations |
| `backups/verify.log` | Automated verification test results |

### What to Watch For

- **Daily backup age > 25 hours** — cron may not be running
- **Verification FAILED** — backup may be corrupt; investigate immediately
- **Off-site replication failed** — check network/credentials; local backup is still safe
- **WAL segments missing** — check PostgreSQL logs and `archive_command` permissions

---

## 7. Configuration Reference

All settings go in `.env`. See `.env.example` for the full list with defaults.

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_PASSPHRASE` | (required) | GPG passphrase for encryption |
| `BACKUP_RETAIN_DAILY` | `30` | Number of daily snapshots to keep |
| `BACKUP_RETAIN_WEEKLY` | `12` | Number of weekly archives to keep |
| `BACKUP_RETAIN_WAL_DAYS` | `14` | Days of WAL segments to retain |
| `BACKUP_WAL_ENABLED` | `false` | Enable WAL archiving for PITR |
| `BACKUP_PG_USER` | `tandem` | PostgreSQL user for backups |
| `BACKUP_PG_DB` | `tandem` | Database name |

### Off-Site Settings

See section 4 above for rsync, S3, and rclone configuration.

---

## 8. Directory Structure

```
backups/
├── daily/                                    # Encrypted daily pg_dump snapshots
│   ├── tandem_20260221_020000.pg_dump.gpg
│   └── tandem_20260221_020000.pg_dump.gpg.sha256
├── weekly/                                   # Encrypted full-system archives
│   ├── tandem_full_20260216_030000.tar.gz.gpg
│   └── tandem_full_20260216_030000.tar.gz.gpg.sha256
├── wal/                                      # Archived WAL segments (compressed)
│   └── 000000010000000000000045.gz
├── wal-base/                                 # pg_basebackup snapshots for PITR
│   └── base_20260216_040000.tar.gz
├── dr.log                                    # Unified DR operations log
└── verify.log                                # Automated verification results
```

---

## 9. Encryption

All backups use GPG symmetric encryption with AES-256. The passphrase is the ONLY thing needed to decrypt — there are no keys to manage, rotate, or expire.

### Manual Decrypt (if scripts aren't available)

```bash
gpg --batch --yes --decrypt \
    --passphrase-fd 3 3<<<"YOUR_PASSPHRASE" \
    --output tandem.pg_dump tandem_20260221_020000.pg_dump.gpg
```

### Manual Restore (if scripts aren't available)

```bash
# Decrypt
gpg --decrypt --output backup.pg_dump backup.pg_dump.gpg

# Restore
pg_restore --dbname=tandem --clean --if-exists backup.pg_dump
```

This means you can always recover even without the Tandem scripts — all you need is `gpg`, `pg_restore`, and your passphrase.

---

## 10. Security Considerations

- **Passphrase storage:** Do NOT store the passphrase only on the server. If the server is compromised, the attacker gets backups + passphrase. Use a password manager or physical safe.
- **SSH keys for rsync:** Use a dedicated key (`id_tandem_backup`) with restricted `command=` in the remote `authorized_keys`.
- **S3 credentials:** Use a dedicated application key with write-only permissions. No delete permissions protects against ransomware.
- **WAL files** contain a replay of every database change and may include sensitive data. The `backups/wal/` directory has restrictive permissions.
- **Sudoers entry** is scoped to exactly the commands needed — no blanket `NOPASSWD: ALL`.
- **The verify database** (`tandem_verify`) is created, tested, and dropped within a single script run.

---

## 11. Troubleshooting

### "BACKUP_PASSPHRASE is not set"

Add it to `.env`:
```bash
echo "BACKUP_PASSPHRASE=\"$(openssl rand -base64 48)\"" >> .env
```

### "pg_dump: error: connection to database failed"

Check that PostgreSQL is running and the backup user has access:
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT 1;"
```

### "Checksum verification failed"

The backup file may be corrupted. Try an older backup:
```bash
ls -lt backups/daily/
sudo ./scripts/dr-restore.sh --from backups/daily/tandem_OLDER_DATE.pg_dump.gpg
```

### "pg_restore: error: could not execute query"

Common during restores. Minor errors (duplicate keys, missing extensions) are usually safe to ignore — `pg_restore` continues past them. Check the output for anything that looks critical.

### WAL archiving not working

Check PostgreSQL logs:
```bash
sudo journalctl -u postgresql --since "1 hour ago"
```

Verify the archive command works manually:
```bash
sudo -u postgres /opt/tandem/scripts/archive-wal.sh /var/lib/postgresql/16/main/pg_wal/000000010000000000000001 000000010000000000000001
```
