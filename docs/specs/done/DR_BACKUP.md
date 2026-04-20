# Tandem GTD — Disaster Recovery & Backup Specification (Bare Metal)

**Status:** Draft
**Version:** v1.1 Feature
**Date:** 2026-02-21
**Target Stack:** Native PostgreSQL 16 + Next.js (systemd) on Ubuntu 24.04
**Replaces:** Section 12.7 of TANDEM_SPEC.md (basic daily backups)

---

## 1. Overview

Tandem is self-hosted. There's no Tandem Inc. running nightly backups on your behalf. If a user's VPS disk fails, gets ransomwared, or they accidentally drop a table, their GTD data — every project, next action, someday/maybe, and weekly review — is gone unless the backup system caught it first.

This spec defines a comprehensive disaster recovery system for **bare-metal Linux deployments** where PostgreSQL and Tandem run natively (no Docker). The system protects against four threat scenarios (in ranked priority):

1. **Disk / hardware failure on the VPS** — the server dies, disk corrupts, or the provider has an outage
2. **Ransomware or server compromise** — attacker encrypts or deletes data
3. **Accidental data deletion / user error** — `DROP TABLE`, bad migration, "I deleted the wrong project"
4. **Corrupted database or bad migration** — Prisma migration goes sideways, pg data directory corrupts

The backup system follows the **3-2-1 rule**: 3 copies of data, on 2 different storage types, with 1 copy off-site. Every backup is encrypted at rest with GPG, verified automatically after creation, and pruned on a configurable retention schedule.

### Target Stack Assumptions

```
Ubuntu 24.04 (or 22.04)
├── PostgreSQL 16          (apt install, managed by systemd: postgresql.service)
├── Node.js 20+            (system install)
├── Tandem Next.js app     (systemd: tandem.service)
├── Caddy 2                (reverse proxy, systemd: caddy.service)  [optional]
└── /opt/tandem/           (application root)
    ├── .env
    ├── .next/standalone/
    ├── prisma/
    └── backups/
```

All DR scripts interact with PostgreSQL directly via `pg_dump`, `pg_restore`, `pg_basebackup`, and `psql` — no Docker exec wrappers, no container networking. Services are stopped and started via `systemctl`.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tandem Server (VPS / Bare Metal / Home Server)                     │
│                                                                     │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐   │
│  │ PostgreSQL 16 │───▶│  Backup Pipeline                       │   │
│  │ (native)      │    │                                        │   │
│  │               │    │  1. pg_dump (custom format) or WAL     │   │
│  │  WAL ─────────│───▶│  2. gzip compress                     │   │
│  │  stream       │    │  3. GPG encrypt (symmetric, AES-256)  │   │
│  └──────────────┘    │  4. SHA-256 checksum + verify          │   │
│                      │  5. Write to local backup dir           │   │
│  ┌──────────────┐    │  6. Replicate off-site (async)         │   │
│  │ Tandem App   │    └──────────┬──────────┬──────────┬───────┘   │
│  │ (systemd)    │               │          │          │           │
│  └──────────────┘      ┌───────▼───┐ ┌────▼─────┐ ┌──▼────────┐  │
│                        │  Local    │ │ Off-site │ │ Off-site  │  │
│  ┌──────────────┐      │  /backups │ │ rsync    │ │ S3/rclone │  │
│  │ Caddy        │      └──────────┘ └──────────┘ └───────────┘  │
│  │ (systemd)    │                                                 │
│  └──────────────┘                                                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Full System Backup (weekly)                                 │   │
│  │  DB dump + .env + Caddyfile + prisma/ + tandem.service       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backup Tiers

### Tier 1 — Continuous WAL Archiving (Point-in-Time Recovery)

**Protects against:** Accidental deletion, bad migrations, any "I need to go back to 3:47 PM yesterday" scenario.

PostgreSQL's Write-Ahead Log (WAL) captures every database change in real time. By archiving WAL segments, Tandem can restore to any point in time — not just the last snapshot.

**How it works:**
- PostgreSQL is configured via a drop-in conf file: `/etc/postgresql/16/main/conf.d/tandem-backup.conf`
- Completed WAL segments (16MB each) are compressed and copied to the backup archive
- A base backup (`pg_basebackup`) is taken weekly as the PITR anchor point
- Recovery can target any timestamp between the oldest base backup and the latest WAL segment

**Configuration (drop-in file — no editing of main postgresql.conf):**

```ini
# /etc/postgresql/16/main/conf.d/tandem-backup.conf
wal_level = replica
archive_mode = on
archive_command = '/opt/tandem/scripts/archive-wal.sh %p %f'
archive_timeout = 300     # Force archive every 5 min even if WAL isn't full
```

After placing this file, reload PostgreSQL (no restart needed for `archive_mode` change on first enable, but `wal_level` change requires restart):

```bash
sudo systemctl restart postgresql    # Required for wal_level change
```

**Retention:** Base backups kept 14 days. WAL segments kept 14 days. Full 14-day PITR window.

**Storage estimate:** A single-user Tandem instance generates minimal WAL — roughly 16-50MB/day. Base backups are similarly small (personal GTD database is megabytes, not gigabytes). Total WAL storage: ~1-2GB for a 14-day window.

### Tier 2 — Scheduled Full Snapshots (Daily + Weekly)

**Protects against:** Disk failure, corruption, quick recovery without PITR complexity.

This is the upgraded version of the existing `backup.sh` — same pg_dump approach, but now with custom format, encryption, verification, and off-site replication.

**Daily snapshots (2:00 AM server time):**
- `pg_dump --format=custom` (compressed, supports selective restore)
- GPG symmetric encryption (AES-256)
- SHA-256 checksum alongside the backup file
- Automatic verification: decrypt → test restore into a throwaway database → compare row counts → drop throwaway
- Replicate to all configured off-site targets
- Retain 30 daily snapshots locally

**Weekly full-system snapshots (Sunday 3:00 AM):**
- Everything in the daily snapshot, plus:
- Configuration files: `.env`, Caddyfile, `tandem.service`
- Prisma schema + migration history (`prisma/` directory)
- PostgreSQL config drop-in (`tandem-backup.conf`)
- All packaged into a single encrypted archive
- Retain 12 weekly snapshots (3 months)

### Tier 3 — Off-Site Replication

**Protects against:** Server compromise, ransomware, datacenter fire, VPS provider failure.

Every Tier 1 and Tier 2 backup is replicated to at least one off-site target. Three methods, usable individually or combined:

**Method A — rsync/scp to a second server:**
- Simplest for users with a second VPS, home server, or friend's machine
- SSH key auth (no passwords in scripts)
- Incremental transfer via rsync — only changed files sent
- Bandwidth limiting support

**Method B — S3-compatible object storage:**
- Backblaze B2 ($0.005/GB/mo), MinIO (self-hosted), Wasabi, AWS S3, or any S3-compatible provider
- Uses `aws` CLI (lightweight, no SDK dependency)
- S3 lifecycle rules for automatic expiration
- Server-side encryption (SSE) as a second encryption layer

**Method C — rclone (universal remote):**
- 70+ backends: Google Drive, Dropbox, OneDrive, SFTP, any S3-compatible store
- Useful for pushing backups to a personal Google Drive or Dropbox
- OAuth setup wizard for cloud providers
- Bandwidth limiting, retries, checksumming

---

## 4. Encryption

All backups are encrypted at rest using GPG symmetric encryption with AES-256.

**Why symmetric (passphrase) instead of asymmetric (keypair):**
- Self-hosted users aren't running a PKI
- A passphrase can be printed on paper and stored in a safe (air-gapped recovery)
- No key management, rotation, or expiration to worry about

**Implementation:**
```bash
# Encrypt
gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 3<<<"$BACKUP_PASSPHRASE" \
    --output "$BACKUP_FILE.gpg" "$BACKUP_FILE"

# Decrypt
gpg --batch --yes --decrypt \
    --passphrase-fd 3 3<<<"$BACKUP_PASSPHRASE" \
    --output "$BACKUP_FILE" "$BACKUP_FILE.gpg"
```

**Passphrase management:**
- Stored in `/opt/tandem/.env` as `BACKUP_PASSPHRASE`
- Auto-generated by `setup-local.sh` (64-char random string) if not set
- Users are prompted to write it down or store it in a password manager
- The passphrase is the ONLY thing needed to decrypt backups — if lost, backups are unrecoverable
- `setup-local.sh` prints a clear warning: *"This passphrase is the key to your backups. Store it somewhere safe that is NOT on this server."*

**Encrypted file naming:**
```
tandem_20260221_020000.pg_dump.gpg           # Daily DB snapshot (pg_dump custom format is already compressed)
tandem_20260221_020000.pg_dump.gpg.sha256    # Checksum of encrypted file
tandem_full_20260223_030000.tar.gz.gpg       # Weekly full-system archive
```

**Note:** `pg_dump --format=custom` applies its own compression, so we skip the gzip step for daily snapshots. The weekly full-system archive uses `tar.gz` because it bundles multiple files.

---

## 5. Backup Verification

An unverified backup is not a backup — it's a hope.

### 5.1 Integrity Checks (Every Backup)

After encryption, SHA-256 checksum is computed and stored:

```bash
sha256sum "$BACKUP_FILE.gpg" > "$BACKUP_FILE.gpg.sha256"
```

Before off-site replication, checksum is verified. After replication (for S3/rclone), remote checksum is compared against local. Mismatch triggers retry, then failure flag.

### 5.2 Restore Test (Weekly, Automated)

After the weekly full snapshot, the system runs a full automated restore test:

1. Create a temporary PostgreSQL database (`tandem_verify`)
2. Decrypt the latest daily backup
3. Restore into the temporary database using `pg_restore`
4. Run validation queries:
   - Count rows in every table
   - Compare counts against the live `tandem` database (within reasonable delta)
   - Verify Prisma migration version matches
   - Check that at least one user record exists
5. Drop the temporary database
6. Log results to `backups/verify.log`
7. If verification fails, log `CRITICAL` and optionally send notification

```bash
# The verify script uses native psql — no containers
createdb -U tandem tandem_verify
pg_restore -U tandem -d tandem_verify "$DECRYPTED_BACKUP"
# ... run validation queries ...
dropdb -U tandem tandem_verify
```

### 5.3 Off-Site Verification (Monthly)

Once per month, download the oldest off-site backup within retention and perform a full restore test. Catches silent corruption in remote storage (bit rot, S3 misconfiguration, etc.).

---

## 6. Restore Procedures

### 6.1 Quick Restore — Latest Daily Snapshot

"Something broke, get me back to last night."

```bash
sudo /opt/tandem/scripts/dr-restore.sh latest
```

This command:
1. Stops the Tandem app: `sudo systemctl stop tandem`
2. Finds the most recent `.pg_dump.gpg` in the backup directory
3. Verifies the SHA-256 checksum
4. Decrypts with the passphrase from `.env`
5. Restores into PostgreSQL: `pg_restore -U tandem -d tandem --clean --if-exists`
6. Runs a quick row-count sanity check
7. Restarts the app: `sudo systemctl start tandem`
8. Prints summary with backup timestamp

### 6.2 Point-in-Time Recovery

"I accidentally deleted a project at 3:47 PM. I need the database at 3:46 PM."

```bash
sudo /opt/tandem/scripts/dr-restore.sh --pitr "2026-02-21 15:46:00"
```

This command:
1. Stops Tandem and PostgreSQL:
   ```bash
   sudo systemctl stop tandem
   sudo systemctl stop postgresql
   ```
2. Backs up the current pg data directory (safety net):
   ```bash
   sudo mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.pre-pitr
   ```
3. Finds the most recent base backup before the target timestamp
4. Restores the base backup into a fresh data directory:
   ```bash
   sudo -u postgres pg_basebackup --pgdata=/var/lib/postgresql/16/main \
       --format=tar --wal-method=none  # WAL comes from archive
   ```
   Actually, for PITR from an existing base backup tarball:
   ```bash
   sudo mkdir /var/lib/postgresql/16/main
   sudo chown postgres:postgres /var/lib/postgresql/16/main
   sudo chmod 700 /var/lib/postgresql/16/main
   sudo -u postgres tar xf "$BASE_BACKUP" -C /var/lib/postgresql/16/main
   ```
5. Creates a `recovery.signal` file and configures recovery in PostgreSQL:
   ```bash
   # /var/lib/postgresql/16/main/postgresql.auto.conf (appended)
   restore_command = 'gunzip -c /opt/tandem/backups/wal/%f.gz > %p'
   recovery_target_time = '2026-02-21 15:46:00'
   recovery_target_action = 'promote'
   ```
   ```bash
   sudo -u postgres touch /var/lib/postgresql/16/main/recovery.signal
   ```
6. Starts PostgreSQL — it replays WAL until the target time:
   ```bash
   sudo systemctl start postgresql
   ```
7. Waits for recovery to complete (polls `pg_is_in_recovery()`)
8. Starts the app: `sudo systemctl start tandem`
9. Prints summary with exact recovery point reached
10. Keeps `main.pre-pitr` for 48 hours as a safety net, then cleans up

### 6.3 Full System Restore — New Server

"My VPS is gone. I have a fresh Ubuntu box and my backup passphrase."

```bash
curl -fsSL https://raw.githubusercontent.com/courtemancheatelier/tandem-gtd/main/scripts/dr-bootstrap.sh | bash
```

The bootstrap script:
1. Installs PostgreSQL 16, Node.js 20, Caddy, and GPG via apt
2. Creates the `tandem` system user
3. Asks for the backup source (local file path, rsync remote, S3 bucket, or rclone remote)
4. Pulls the latest full-system archive from the specified source
5. Asks for the backup passphrase
6. Decrypts and extracts: `.env`, Caddyfile, `tandem.service`, Prisma schema, DB dump
7. Creates the PostgreSQL user and database:
   ```bash
   sudo -u postgres createuser tandem
   sudo -u postgres createdb -O tandem tandem
   ```
8. Restores the database from the dump
9. Clones the Tandem repo (or extracts the app bundle from the archive)
10. Runs `npm ci && npm run build` (or extracts pre-built `.next/standalone`)
11. Installs the systemd service and Caddyfile
12. Prompts for domain name (may have changed on the new server)
13. Starts all services
14. Runs a health check and prints the access URL

**Total time from bare Ubuntu to running Tandem: ~5-10 minutes** (assuming decent bandwidth).

### 6.4 Selective Table Restore

"I just deleted all my Someday/Maybe items. Everything else is fine."

```bash
sudo /opt/tandem/scripts/dr-restore.sh --table SomedayMaybe \
    --from backups/daily/tandem_20260221_020000.pg_dump.gpg
```

Because we use `pg_dump --format=custom`, selective restore is built in:
1. Decrypts the backup
2. Uses `pg_restore --table=SomedayMaybe` to restore only that table
3. Handles foreign key ordering automatically

---

## 7. Configuration

### 7.1 New Environment Variables

Added to `.env.example` and managed by `setup-local.sh`:

```bash
# --- Disaster Recovery --------------------------------------------------------

# Encryption passphrase for all backups (CRITICAL: store this off-server)
# Auto-generated by setup-local.sh if empty.
BACKUP_PASSPHRASE=

# Backup schedule (cron expressions, server local time)
BACKUP_SCHEDULE_DAILY="0 2 * * *"
BACKUP_SCHEDULE_WEEKLY="0 3 * * 0"
BACKUP_SCHEDULE_VERIFY="30 4 * * 0"
BACKUP_SCHEDULE_WAL_BASE="0 4 * * 0"

# Retention
BACKUP_RETAIN_DAILY=30
BACKUP_RETAIN_WEEKLY=12
BACKUP_RETAIN_WAL_DAYS=14

# WAL archiving — point-in-time recovery (requires PostgreSQL restart to enable)
BACKUP_WAL_ENABLED=false

# PostgreSQL connection (used by backup scripts)
# These are read from DATABASE_URL if not set separately
BACKUP_PG_USER=tandem
BACKUP_PG_DB=tandem
BACKUP_PG_HOST=localhost
BACKUP_PG_PORT=5432

# --- Off-Site Replication (configure one or more) -----------------------------

# Method A: rsync/scp
BACKUP_RSYNC_ENABLED=false
BACKUP_RSYNC_TARGET=user@backup-server:/backups/tandem
BACKUP_RSYNC_SSH_KEY=/home/tandem/.ssh/id_tandem_backup
BACKUP_RSYNC_BANDWIDTH_LIMIT=0             # KB/s, 0 = unlimited

# Method B: S3-compatible storage
BACKUP_S3_ENABLED=false
BACKUP_S3_BUCKET=tandem-backups
BACKUP_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
BACKUP_S3_REGION=us-west-000
BACKUP_S3_STORAGE_CLASS=STANDARD

# Method C: rclone
BACKUP_RCLONE_ENABLED=false
BACKUP_RCLONE_REMOTE=gdrive:tandem-backups
BACKUP_RCLONE_BANDWIDTH_LIMIT=0

# --- Notifications (optional) ------------------------------------------------
BACKUP_NOTIFY_ON_FAILURE=false
BACKUP_NOTIFY_WEBHOOK=                       # Slack/Discord/ntfy webhook URL
BACKUP_NOTIFY_EMAIL=                         # Requires msmtp or similar
```

### 7.2 PostgreSQL Drop-In Configuration

When WAL archiving is enabled, `setup-local.sh` places a drop-in config file:

```ini
# /etc/postgresql/16/main/conf.d/tandem-backup.conf
#
# Tandem GTD — WAL archiving for point-in-time recovery
# Installed by: /opt/tandem/scripts/setup-local.sh
# Remove this file and restart PostgreSQL to disable WAL archiving.

wal_level = replica
archive_mode = on
archive_command = '/opt/tandem/scripts/archive-wal.sh %p %f'
archive_timeout = 300

# Conservative WAL sizing for a low-traffic personal app
max_wal_size = 256MB
min_wal_size = 64MB
checkpoint_completion_target = 0.9
```

**Important:** Ubuntu's PostgreSQL packages support `conf.d/` include directory out of the box. The default `postgresql.conf` includes:
```ini
include_dir = 'conf.d'
```

So dropping a `.conf` file there and reloading/restarting is all it takes. No editing of the main config file.

### 7.3 Backup Directory Structure

Under `/opt/tandem/`:

```
backups/
├── daily/                                    # Encrypted daily pg_dump snapshots
│   ├── tandem_20260221_020000.pg_dump.gpg
│   └── tandem_20260221_020000.pg_dump.gpg.sha256
├── weekly/                                   # Encrypted full-system archives
│   ├── tandem_full_20260216_030000.tar.gz.gpg
│   └── tandem_full_20260216_030000.tar.gz.gpg.sha256
├── wal/                                      # Archived WAL segments (compressed)
│   ├── 000000010000000000000045.gz
│   ├── 000000010000000000000046.gz
│   └── 000000010000000000000047.gz
├── wal-base/                                 # pg_basebackup snapshots for PITR
│   └── base_20260216_040000.tar.gz
├── dr.log                                    # Unified DR operations log
└── verify.log                                # Automated verification results
```

**Permissions:** The `backups/` directory is owned by the `tandem` user with mode `700`. WAL archive scripts run as `postgres` user (since PostgreSQL invokes `archive_command`), so `backups/wal/` is owned by `postgres` with mode `700`. The backup scripts use `sudo -u postgres` for pg_dump operations or configure PostgreSQL peer authentication for the `tandem` user.

---

## 8. New Scripts

The existing `backup.sh` and `restore.sh` are replaced by a unified DR toolkit. All scripts live in `/opt/tandem/scripts/`:

```
scripts/
├── backup.sh              # UPGRADED — daily/weekly: dump → encrypt → verify → replicate
├── restore.sh             # UPGRADED — decrypt + verify + pg_restore
├── dr-restore.sh          # Full DR: latest, --pitr, --table, or full-system
├── dr-bootstrap.sh        # New server provisioning from backup
├── dr-verify.sh           # Automated restore test into throwaway database
├── dr-status.sh           # Dashboard: last backup, sizes, WAL lag, off-site sync
├── archive-wal.sh         # WAL segment archiver (called by PostgreSQL's archive_command)
├── wal-basebackup.sh      # Weekly pg_basebackup for PITR anchor
├── replicate-offsite.sh   # Push backups to configured off-site targets
├── setup-offsite.sh       # Interactive wizard for off-site target configuration
├── setup-local.sh         # UPGRADED — now includes DR setup prompts
├── deploy-local.sh        # (existing, unchanged)
└── tandem.service         # (existing, unchanged)
```

### Script Behavior Standards

All DR scripts follow these conventions:
- `set -euo pipefail` — fail fast on any error
- Source `/opt/tandem/.env` for configuration
- Log to both stdout and `backups/dr.log` with ISO timestamps
- Exit codes: 0 = success, 1 = failure, 2 = partial (backup succeeded, replication failed)
- Support `--dry-run` for testing
- Support `--quiet` for cron (suppress stdout, still log to file)
- Color output when interactive, plain when piped or `--quiet`
- Use `sudo -u postgres` for database operations where needed
- Respect `BACKUP_PG_*` env vars (or parse from `DATABASE_URL`)

### Key Differences from Docker-Based Scripts

| Operation | Docker version | Bare-metal version |
|-----------|---------------|-------------------|
| pg_dump | `docker compose exec -T db pg_dump ...` | `sudo -u postgres pg_dump ...` |
| pg_restore | `... exec -T db pg_restore ...` | `sudo -u postgres pg_restore ...` |
| psql | `... exec -T db psql ...` | `sudo -u postgres psql ...` or `psql -U tandem` |
| pg_basebackup | N/A (wasn't implemented) | `sudo -u postgres pg_basebackup ...` |
| Stop app | `docker compose stop app` | `sudo systemctl stop tandem` |
| Start app | `docker compose start app` | `sudo systemctl start tandem` |
| Stop database | `docker compose stop db` | `sudo systemctl stop postgresql` |
| WAL config | Mount `backup.conf` into container | Drop-in `/etc/postgresql/16/main/conf.d/` |
| Temp DB for verify | Spin up temp container | `createdb tandem_verify` → `dropdb` |

---

## 9. Cron Schedule

Installed into the `tandem` user's crontab by `setup-local.sh` (not root crontab — principle of least privilege, except where `sudo` is needed):

```cron
# Tandem GTD — Disaster Recovery Schedule
# Installed by: /opt/tandem/scripts/setup-local.sh
# Edit with: crontab -u tandem -e

# Daily database snapshot (2:00 AM)
0 2 * * *   /opt/tandem/scripts/backup.sh --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Weekly full-system snapshot (Sunday 3:00 AM)
0 3 * * 0   /opt/tandem/scripts/backup.sh --full --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Weekly WAL base backup (Sunday 4:00 AM) — only runs if WAL enabled
0 4 * * 0   /opt/tandem/scripts/wal-basebackup.sh --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Weekly automated restore verification (Sunday 4:30 AM)
30 4 * * 0  /opt/tandem/scripts/dr-verify.sh --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log

# Monthly off-site verification (1st of month, 5:00 AM)
0 5 1 * *   /opt/tandem/scripts/dr-verify.sh --remote --quiet 2>&1 | tee -a /opt/tandem/backups/dr.log
```

**Sudoers entry** (installed by `setup-local.sh`):

```sudoers
# /etc/sudoers.d/tandem-backup
# Allow tandem user to run backup-related PostgreSQL commands without password
tandem ALL=(postgres) NOPASSWD: /usr/bin/pg_dump, /usr/bin/pg_restore, /usr/bin/pg_basebackup, /usr/bin/psql, /usr/bin/createdb, /usr/bin/dropdb
tandem ALL=(root) NOPASSWD: /usr/bin/systemctl stop tandem, /usr/bin/systemctl start tandem, /usr/bin/systemctl restart tandem
tandem ALL=(root) NOPASSWD: /usr/bin/systemctl stop postgresql, /usr/bin/systemctl start postgresql, /usr/bin/systemctl restart postgresql
```

This keeps the cron jobs running as the unprivileged `tandem` user while granting precisely the elevated permissions needed for backup and restore operations.

---

## 10. Status Dashboard

```
$ /opt/tandem/scripts/dr-status.sh

Tandem GTD — Disaster Recovery Status
======================================

  Local Backups
  ─────────────
  Last daily snapshot:    2026-02-21 02:00:03  (19 hours ago)  ✓
  Last weekly full:       2026-02-16 03:00:12  (5 days ago)    ✓
  Daily snapshots:        28 of 30 retained
  Weekly snapshots:       8 of 12 retained
  Local disk usage:       142 MB

  WAL Archiving
  ─────────────
  Status:                 ENABLED  ✓
  Last WAL segment:       000000010000000000000047  (12 min ago)
  Base backup:            2026-02-16 04:00:00  (5 days ago)    ✓
  PITR window:            2026-02-07 04:00:00 → now
  WAL archive size:       38 MB

  Off-Site Replication
  ────────────────────
  rsync → backup.local:   Last sync 2026-02-21 02:01:14       ✓
  S3 → b2://tandem:       Last sync 2026-02-21 02:01:22       ✓
  rclone:                 Not configured

  Verification
  ────────────
  Last restore test:      2026-02-16 04:32:00  PASSED         ✓
  Last off-site verify:   2026-02-01 05:12:00  PASSED         ✓

  Encryption
  ──────────
  Passphrase configured:  Yes                                  ✓
  GPG available:          Yes (2.4.5)                          ✓

  Services
  ────────
  postgresql.service:     active (running)                     ✓
  tandem.service:         active (running)                     ✓
  caddy.service:          active (running)                     ✓
```

Also available as JSON (`dr-status.sh --json`) for future admin panel integration.

---

## 11. Failure Notifications

Self-hosted means the user IS the ops team. When backups fail, someone needs to know.

**Supported channels:**
- **Webhook (Slack / Discord / ntfy.sh):** POST JSON to a URL
- **Email:** Requires `msmtp` or system `sendmail` configured separately
- **Local file:** Always writes to `backups/dr.log` regardless of other settings

**Events that trigger notifications:**
- Backup failed (any tier)
- Off-site replication failed
- Verification test failed
- WAL archiving gap detected (missing segments)
- Backup passphrase not configured (daily reminder until set)
- Disk space below 1GB on backup partition

**Webhook payload:**
```json
{
  "source": "tandem-dr",
  "level": "critical",
  "event": "backup_failed",
  "message": "Daily backup failed: pg_dump exited with code 1",
  "server": "gtd.example.com",
  "timestamp": "2026-02-21T02:00:14Z",
  "details": {
    "script": "backup.sh",
    "exit_code": 1,
    "stderr": "pg_dump: error: connection to database \"tandem\" failed..."
  }
}
```

---

## 12. Setup Flow

### 12.1 Updated setup-local.sh

The existing `setup-local.sh` gets new DR steps appended:

```
========================================
  Tandem GTD — Local Setup
========================================

[1/8] Checking prerequisites...       ✓ Node.js, npm, psql
[2/8] Creating .env...                ✓ Secrets generated
[3/8] Database setup...               ✓ tandem database ready
[4/8] Installing dependencies...      ✓ npm install
[5/8] Prisma generate + migrate...    ✓ Schema up to date
[6/8] Building production bundle...   ✓ .next/standalone ready

[7/8] Disaster Recovery setup...

  ┌──────────────────────────────────────────────────┐
  │  ⚠  BACKUP PASSPHRASE — WRITE THIS DOWN         │
  │                                                   │
  │  xK9m2vR8...dF3nQ7w                             │
  │                                                   │
  │  This passphrase encrypts all your backups.       │
  │  If you lose it, your backups are unrecoverable.  │
  │  Store it in a password manager or print it.      │
  │  DO NOT store it only on this server.             │
  └──────────────────────────────────────────────────┘

  Enable WAL archiving for point-in-time recovery? [y/N]: y
  ✓ WAL config installed at /etc/postgresql/16/main/conf.d/tandem-backup.conf
  ✓ PostgreSQL restarted

  Configure off-site backup replication? [y/N]: y
  → Running off-site setup wizard...

[8/8] Installing backup schedule...
  ✓ Sudoers entry installed
  ✓ Daily backup cron installed (2:00 AM)
  ✓ Weekly full backup installed (Sunday 3:00 AM)
  ✓ Weekly verification installed (Sunday 4:30 AM)
  ✓ First backup running now...

========================================
  Setup complete!
========================================
```

### 12.2 Off-Site Setup Wizard

`setup-offsite.sh` is interactive:

```
Tandem GTD — Off-Site Backup Setup
====================================

Which off-site method(s) do you want to configure?

  [1] rsync/scp to another server (simplest)
  [2] S3-compatible storage (Backblaze B2, MinIO, AWS S3)
  [3] rclone (Google Drive, Dropbox, OneDrive, SFTP, etc.)
  [4] Skip for now

Select one or more (e.g., 1,2): _
```

Each method walks through configuration: SSH key generation for rsync, bucket creation for S3, OAuth flow for rclone.

---

## 13. PostgreSQL Auth for Backup Scripts

Native PostgreSQL uses `pg_hba.conf` for authentication. The backup scripts need to connect without password prompts. Two approaches (setup wizard lets the user choose):

**Option A — Peer authentication (default on Ubuntu):**
Backup scripts use `sudo -u postgres pg_dump ...` which authenticates via OS user. This works out of the box — no password files needed. The sudoers entry in Section 9 grants this.

**Option B — .pgpass file:**
If the `tandem` database user has a password (which it does if `DATABASE_URL` includes one), create a `.pgpass` for non-interactive access:

```bash
# /home/tandem/.pgpass
localhost:5432:tandem:tandem:THE_PASSWORD
```
```bash
chmod 600 /home/tandem/.pgpass
```

Then scripts can use `pg_dump -U tandem -d tandem` directly without sudo.

**Recommendation:** Option A for single-user setups (simpler, no password file to manage). Option B for multi-user bare-metal setups where the tandem user shouldn't have full postgres superuser access via sudo.

---

## 14. Migration from Existing Backups

Users upgrading from the current `backup.sh` (pre-DR) get a smooth transition:

1. `setup-local.sh` detects existing `backups/*.sql.gz` files
2. Asks if user wants to migrate them to encrypted format
3. Existing backups are encrypted in place (originals shredded with `shred -u`)
4. Flat `backups/` structure reorganized into `backups/daily/` and `backups/weekly/`
5. Old cron entry replaced with new schedule
6. One-time full backup triggered to establish new baseline

---

## 15. Security Considerations

- **Backup passphrase** must NOT be stored only on the server. If the server is compromised, attacker gets backups + passphrase. Store in password manager, on paper, or on a separate device.
- **SSH keys for rsync** should be backup-specific (`id_tandem_backup`) with restricted `command=` in remote `authorized_keys`.
- **S3 credentials** should use a dedicated application key with write-only permissions. No delete permissions — protects against ransomware deleting backups.
- **WAL files** contain a replay of every DB change and may include sensitive data. `backups/wal/` has mode `700`, owned by `postgres`.
- **Sudoers entry** is scoped to exactly the commands needed — no blanket `NOPASSWD: ALL`.
- **The verify database** (`tandem_verify`) is created, tested, and dropped within a single script run. It's never left running.
- **`dr-bootstrap.sh`** via curl-pipe has inherent risks. Users who prefer can clone the repo first.
- **Backup directory** should ideally be on a different partition than the PostgreSQL data directory. If the main disk fills up, you don't want backups competing with the database for space.

---

## 16. Future: Docker Compatibility

This spec is written for bare-metal first, but the scripts are designed to be easily adapted for Docker later. The key abstraction points:

- All PostgreSQL commands go through helper functions (`_pg_dump()`, `_pg_restore()`, `_psql()`) that can be swapped to use `docker compose exec` wrappers
- Service start/stop goes through `_service_stop()` / `_service_start()` helpers that can switch between `systemctl` and `docker compose`
- WAL config goes through a setup function that can either drop a file into `conf.d/` or mount it as a Docker volume
- A `TANDEM_DEPLOY_MODE` env var (`native` or `docker`) controls which backend the helpers use

This means a future Docker deployment can reuse the same DR scripts with minimal changes.

---

## 17. Implementation Priority

**Phase 1 — Core Encrypted Backups (Week 1-2):**
- Upgrade `backup.sh`: `pg_dump --format=custom`, GPG encryption, SHA-256 checksums
- Upgrade `restore.sh`: decrypt + verify + `pg_restore`
- Add `BACKUP_PASSPHRASE` to `.env.example` and `setup-local.sh`
- Directory structure: `backups/daily/`, `backups/weekly/`
- Weekly full-system archive (DB + .env + service files + prisma/)
- Retention logic with configurable counts
- Sudoers entry for tandem user

**Phase 2 — Verification (Week 2-3):**
- `dr-verify.sh`: createdb → restore → validate → dropdb
- `dr-status.sh`: dashboard showing backup health
- Structured logging to `dr.log` and `verify.log`

**Phase 3 — Off-Site Replication (Week 3-4):**
- `replicate-offsite.sh`: rsync, S3 (`aws` CLI), rclone
- `setup-offsite.sh`: interactive wizard
- Off-site env vars in `.env.example`
- Test with Backblaze B2 and rsync

**Phase 4 — WAL / PITR (Week 4-5):**
- `tandem-backup.conf` drop-in for PostgreSQL
- `archive-wal.sh` (called by `archive_command`)
- `wal-basebackup.sh` (weekly `pg_basebackup`)
- PITR restore in `dr-restore.sh --pitr`
- End-to-end PITR test

**Phase 5 — Polish (Week 5-6):**
- `dr-bootstrap.sh` for bare-metal recovery on new server
- Selective table restore (`dr-restore.sh --table`)
- Failure notifications (webhook + email)
- Migration path from pre-DR backups
- Documentation updates

---

## 18. Testing Checklist

- [ ] Daily backup creates encrypted, checksummed snapshot
- [ ] Weekly full-system archive includes DB + config + prisma
- [ ] Restore from latest daily works end-to-end
- [ ] Restore from weekly full-system archive works on clean Ubuntu
- [ ] PITR restore to specific timestamp recovers correct data
- [ ] Selective table restore recovers only the specified table
- [ ] `dr-bootstrap.sh` provisions a working Tandem from scratch
- [ ] rsync replication works, checksums match
- [ ] S3 replication works (tested with Backblaze B2)
- [ ] rclone replication works (tested with at least one backend)
- [ ] Automated verification catches deliberately corrupted backup
- [ ] Failure notification fires when backup fails
- [ ] Upgrade from pre-DR backups migrates cleanly
- [ ] All scripts work on Ubuntu 22.04 and 24.04
- [ ] PostgreSQL peer auth works for backup scripts
- [ ] `.pgpass` auth works as alternative
- [ ] Sudoers entry is correctly scoped
- [ ] WAL archiving survives PostgreSQL restart
- [ ] Passphrase-less restore fails with clear error message
- [ ] `dr-status.sh` accurately reflects system state
- [ ] Cron schedule installs correctly under tandem user
- [ ] Scripts work when /opt/tandem is on a different partition than pgdata
