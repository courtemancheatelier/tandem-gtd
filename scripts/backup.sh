#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Database Backup
# =============================================================================
# Daily or weekly encrypted database backup with verification and off-site
# replication.
#
# Usage:
#   ./scripts/backup.sh              # Daily database snapshot
#   ./scripts/backup.sh --full       # Weekly full-system archive
#   ./scripts/backup.sh --quiet      # Suppress stdout (for cron)
#   ./scripts/backup.sh --dry-run    # Show what would happen
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

FULL=false
QUIET=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --full)    FULL=true ;;
    --quiet)   QUIET=true ;;
    --dry-run) DRY_RUN=true ;;
    *)         echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ─── Colors (disabled in quiet mode) ─────────────────────────────────────────

if [ "$QUIET" = true ] || ! [ -t 1 ]; then
  RED=''; GREEN=''; BLUE=''; YELLOW=''; NC=''
else
  RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ISO_TIMESTAMP=$(date -Iseconds)

info()  { echo -e "${BLUE}[INFO]${NC} $ISO_TIMESTAMP $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $ISO_TIMESTAMP $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $ISO_TIMESTAMP $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $ISO_TIMESTAMP $*"; exit 1; }

# ─── Load config ─────────────────────────────────────────────────────────────

ENV_FILE="${PROJECT_DIR}/.env"
[ -f "$ENV_FILE" ] || fail ".env not found at $ENV_FILE"
set -a; source "$ENV_FILE"; set +a

BACKUP_DIR="${PROJECT_DIR}/backups"
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
LOG_FILE="${BACKUP_DIR}/dr.log"

PASSPHRASE="${BACKUP_PASSPHRASE:-}"
PG_USER="${BACKUP_PG_USER:-tandem}"
PG_DB="${BACKUP_PG_DB:-tandem}"
PG_HOST="${BACKUP_PG_HOST:-localhost}"
PG_PORT="${BACKUP_PG_PORT:-5432}"
RETAIN_DAILY="${BACKUP_RETAIN_DAILY:-30}"
RETAIN_WEEKLY="${BACKUP_RETAIN_WEEKLY:-12}"

[ -n "$PASSPHRASE" ] || fail "BACKUP_PASSPHRASE is not set in .env. Run setup-local.sh or set it manually."
command -v gpg >/dev/null 2>&1 || fail "gpg is not installed."

# ─── Setup directories ──────────────────────────────────────────────────────

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
chmod 750 "$BACKUP_DIR"
chmod 770 "$DAILY_DIR" "$WEEKLY_DIR"

# ─── Log wrapper ─────────────────────────────────────────────────────────────

log() {
  echo "$ISO_TIMESTAMP $*" >> "$LOG_FILE"
}

# ─── Daily database snapshot ────────────────────────────────────────────────

do_daily_backup() {
  local DUMP_FILE="${DAILY_DIR}/tandem_${TIMESTAMP}.pg_dump"
  local ENC_FILE="${DUMP_FILE}.gpg"
  local SUM_FILE="${ENC_FILE}.sha256"

  info "Starting daily database backup..."
  log "BACKUP daily start"

  if [ "$DRY_RUN" = true ]; then
    info "[DRY-RUN] Would dump ${PG_DB} to ${DUMP_FILE}"
    info "[DRY-RUN] Would encrypt to ${ENC_FILE}"
    return 0
  fi

  # Dump (pipe from postgres to avoid file ownership issues)
  sudo -u postgres pg_dump --format=custom --dbname="$PG_DB" > "$DUMP_FILE" 2>/dev/null || {
    log "BACKUP daily FAILED: pg_dump error"
    fail "pg_dump failed"
  }

  # Encrypt
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-fd 3 3<<<"$PASSPHRASE" \
      --output "$ENC_FILE" "$DUMP_FILE"

  # Checksum
  sha256sum "$ENC_FILE" > "$SUM_FILE"

  # Remove unencrypted dump
  rm -f "$DUMP_FILE"

  local SIZE
  SIZE=$(du -h "$ENC_FILE" | cut -f1)
  ok "Daily backup complete: ${ENC_FILE} (${SIZE})"
  log "BACKUP daily OK: $(basename "$ENC_FILE") (${SIZE})"
}

# ─── Weekly full-system archive ──────────────────────────────────────────────

do_weekly_backup() {
  local ARCHIVE_NAME="tandem_full_${TIMESTAMP}"
  local STAGING_DIR
  STAGING_DIR=$(mktemp -d)
  trap 'rm -rf "$STAGING_DIR"' RETURN

  local TAR_FILE="${WEEKLY_DIR}/${ARCHIVE_NAME}.tar.gz"
  local ENC_FILE="${TAR_FILE}.gpg"
  local SUM_FILE="${ENC_FILE}.sha256"

  info "Starting weekly full-system backup..."
  log "BACKUP weekly start"

  if [ "$DRY_RUN" = true ]; then
    info "[DRY-RUN] Would create full-system archive at ${ENC_FILE}"
    return 0
  fi

  # Database dump (pipe from postgres to avoid file ownership issues)
  sudo -u postgres pg_dump --format=custom --dbname="$PG_DB" \
      > "${STAGING_DIR}/tandem.pg_dump" 2>/dev/null || {
    log "BACKUP weekly FAILED: pg_dump error"
    fail "pg_dump failed during weekly backup"
  }

  # Copy config files
  [ -f "${PROJECT_DIR}/.env" ] && cp "${PROJECT_DIR}/.env" "${STAGING_DIR}/.env"
  [ -d "${PROJECT_DIR}/prisma" ] && cp -r "${PROJECT_DIR}/prisma" "${STAGING_DIR}/prisma"
  [ -f "${SCRIPT_DIR}/tandem.service" ] && cp "${SCRIPT_DIR}/tandem.service" "${STAGING_DIR}/"
  [ -f "/etc/postgresql/16/main/conf.d/tandem-backup.conf" ] && \
    cp "/etc/postgresql/16/main/conf.d/tandem-backup.conf" "${STAGING_DIR}/" 2>/dev/null || true

  # Create tarball
  tar -czf "$TAR_FILE" -C "$STAGING_DIR" .

  # Encrypt
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-fd 3 3<<<"$PASSPHRASE" \
      --output "$ENC_FILE" "$TAR_FILE"

  # Checksum
  sha256sum "$ENC_FILE" > "$SUM_FILE"

  # Remove unencrypted tarball
  rm -f "$TAR_FILE"

  local SIZE
  SIZE=$(du -h "$ENC_FILE" | cut -f1)
  ok "Weekly full-system backup complete: ${ENC_FILE} (${SIZE})"
  log "BACKUP weekly OK: $(basename "$ENC_FILE") (${SIZE})"
}

# ─── Retention cleanup ──────────────────────────────────────────────────────

cleanup_old_backups() {
  info "Cleaning up old backups..."

  # Daily: keep N most recent
  local COUNT
  COUNT=$(find "$DAILY_DIR" -name "*.pg_dump.gpg" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt "$RETAIN_DAILY" ]; then
    local TO_DELETE=$((COUNT - RETAIN_DAILY))
    find "$DAILY_DIR" -name "*.pg_dump.gpg" -print0 | sort -z | head -z -n "$TO_DELETE" | while IFS= read -r -d '' f; do
      rm -f "$f" "${f}.sha256"
      log "PRUNE daily: $(basename "$f")"
    done
    ok "Pruned ${TO_DELETE} old daily backups"
  fi

  # Weekly: keep N most recent
  COUNT=$(find "$WEEKLY_DIR" -name "*.tar.gz.gpg" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt "$RETAIN_WEEKLY" ]; then
    local TO_DELETE=$((COUNT - RETAIN_WEEKLY))
    find "$WEEKLY_DIR" -name "*.tar.gz.gpg" -print0 | sort -z | head -z -n "$TO_DELETE" | while IFS= read -r -d '' f; do
      rm -f "$f" "${f}.sha256"
      log "PRUNE weekly: $(basename "$f")"
    done
    ok "Pruned ${TO_DELETE} old weekly backups"
  fi
}

# ─── Off-site replication ───────────────────────────────────────────────────

replicate() {
  if [ -f "${SCRIPT_DIR}/replicate-offsite.sh" ]; then
    info "Starting off-site replication..."
    "${SCRIPT_DIR}/replicate-offsite.sh" --quiet || {
      warn "Off-site replication failed (backup itself succeeded)"
      log "REPLICATE FAILED"
      return 2
    }
  fi
}

# ─── Main ───────────────────────────────────────────────────────────────────

do_daily_backup

if [ "$FULL" = true ]; then
  do_weekly_backup
fi

cleanup_old_backups
replicate || true

echo ""
ok "Backup complete."
log "BACKUP session complete"
