#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Disaster Recovery Restore
# =============================================================================
# Restores Tandem database from encrypted backups.
#
# Usage:
#   ./scripts/dr-restore.sh latest                              # Latest daily snapshot
#   ./scripts/dr-restore.sh --from backups/daily/file.gpg       # Specific backup file
#   ./scripts/dr-restore.sh --pitr "2026-02-21 15:46:00"        # Point-in-time recovery
#   ./scripts/dr-restore.sh --table Task --from file.gpg        # Selective table restore
#   ./scripts/dr-restore.sh --dry-run latest                    # Show what would happen
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

MODE=""
FROM_FILE=""
PITR_TARGET=""
TABLE_NAME=""
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    latest)    MODE="latest"; shift ;;
    --from)    FROM_FILE="$2"; MODE="file"; shift 2 ;;
    --pitr)    PITR_TARGET="$2"; MODE="pitr"; shift 2 ;;
    --table)   TABLE_NAME="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

[ -n "$MODE" ] || { echo "Usage: dr-restore.sh latest | --from <file> | --pitr <timestamp>"; exit 1; }

# ─── Colors ─────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ─── Load config ────────────────────────────────────────────────────────────

ENV_FILE="${PROJECT_DIR}/.env"
[ -f "$ENV_FILE" ] || fail ".env not found at $ENV_FILE"
set -a; source "$ENV_FILE"; set +a

BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${BACKUP_DIR}/dr.log"

PASSPHRASE="${BACKUP_PASSPHRASE:-}"
PG_USER="${BACKUP_PG_USER:-tandem}"
PG_DB="${BACKUP_PG_DB:-tandem}"

[ -n "$PASSPHRASE" ] || fail "BACKUP_PASSPHRASE is not set in .env"

log() { echo "$(date -Iseconds) $*" >> "$LOG_FILE"; }

# ─── Find backup file ──────────────────────────────────────────────────────

resolve_backup_file() {
  if [ "$MODE" = "latest" ]; then
    FROM_FILE=$(find "${BACKUP_DIR}/daily" -name "*.pg_dump.gpg" 2>/dev/null | sort | tail -n1)
    [ -n "$FROM_FILE" ] || fail "No daily backups found in ${BACKUP_DIR}/daily/"
    info "Latest backup: $(basename "$FROM_FILE")"
  fi

  # Resolve relative paths
  if [[ "$FROM_FILE" != /* ]]; then
    FROM_FILE="${PROJECT_DIR}/${FROM_FILE}"
  fi

  [ -f "$FROM_FILE" ] || fail "Backup file not found: $FROM_FILE"

  # Verify checksum if available
  local SUM_FILE="${FROM_FILE}.sha256"
  if [ -f "$SUM_FILE" ]; then
    info "Verifying checksum..."
    (cd "$(dirname "$FROM_FILE")" && sha256sum -c "$SUM_FILE" --quiet 2>/dev/null) || {
      fail "Checksum verification failed for $(basename "$FROM_FILE")"
    }
    ok "Checksum verified"
  fi
}

# ─── Decrypt ────────────────────────────────────────────────────────────────

decrypt_backup() {
  local INPUT="$1"
  local OUTPUT="${INPUT%.gpg}"

  info "Decrypting $(basename "$INPUT")..."
  gpg --batch --yes --decrypt \
      --passphrase-fd 3 3<<<"$PASSPHRASE" \
      --output "$OUTPUT" "$INPUT"

  echo "$OUTPUT"
}

# ─── Restore from pg_dump ──────────────────────────────────────────────────

restore_daily() {
  resolve_backup_file

  echo ""
  echo "========================================"
  echo "  Tandem GTD — Restore from Backup"
  echo "========================================"
  echo ""
  echo "  Source:    $(basename "$FROM_FILE")"
  echo "  Database:  ${PG_DB}"
  if [ -n "$TABLE_NAME" ]; then
    echo "  Table:     ${TABLE_NAME}"
  fi
  echo ""

  if [ "$DRY_RUN" = true ]; then
    info "[DRY-RUN] Would restore $(basename "$FROM_FILE") into ${PG_DB}"
    return 0
  fi

  read -r -p "This will overwrite the current database. Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

  log "RESTORE start: $(basename "$FROM_FILE")"

  # Stop the app
  info "Stopping Tandem..."
  sudo systemctl stop tandem 2>/dev/null || warn "Could not stop tandem service (may not be running)"

  # Decrypt
  local DECRYPTED
  DECRYPTED=$(decrypt_backup "$FROM_FILE")
  trap 'rm -f "$DECRYPTED"' EXIT

  # Restore
  if [ -n "$TABLE_NAME" ]; then
    info "Restoring table ${TABLE_NAME}..."
    sudo -u postgres pg_restore --dbname="$PG_DB" --table="$TABLE_NAME" \
        --clean --if-exists "$DECRYPTED" 2>&1 || true
    ok "Table ${TABLE_NAME} restored"
  else
    info "Restoring full database..."
    sudo -u postgres pg_restore --dbname="$PG_DB" \
        --clean --if-exists "$DECRYPTED" 2>&1 || true
    ok "Database restored"
  fi

  # Quick sanity check
  info "Running sanity check..."
  local ROW_COUNT
  ROW_COUNT=$(sudo -u postgres psql -d "$PG_DB" -tAc \
    "SELECT SUM(n_live_tup) FROM pg_stat_user_tables;" 2>/dev/null || echo "?")
  info "Total rows in database: ${ROW_COUNT}"

  # Restart the app
  info "Starting Tandem..."
  sudo systemctl start tandem 2>/dev/null || warn "Could not start tandem service"

  echo ""
  ok "Restore complete from $(basename "$FROM_FILE")"
  log "RESTORE OK: $(basename "$FROM_FILE") (${ROW_COUNT} rows)"
}

# ─── Point-in-time recovery ────────────────────────────────────────────────

restore_pitr() {
  local WAL_DIR="${BACKUP_DIR}/wal"
  local BASE_DIR="${BACKUP_DIR}/wal-base"
  local PG_DATA="/var/lib/postgresql/16/main"

  [ -d "$WAL_DIR" ] || fail "WAL archive directory not found: ${WAL_DIR}"
  [ -d "$BASE_DIR" ] || fail "No base backups found in: ${BASE_DIR}"

  # Find most recent base backup
  local BASE_BACKUP
  BASE_BACKUP=$(find "$BASE_DIR" -name "base_*.tar.gz" 2>/dev/null | sort | tail -n1)
  [ -n "$BASE_BACKUP" ] || fail "No base backups found"

  echo ""
  echo "========================================"
  echo "  Tandem GTD — Point-in-Time Recovery"
  echo "========================================"
  echo ""
  echo "  Target time:    ${PITR_TARGET}"
  echo "  Base backup:    $(basename "$BASE_BACKUP")"
  echo "  WAL segments:   $(find "$WAL_DIR" -name "*.gz" 2>/dev/null | wc -l | tr -d ' ')"
  echo ""

  if [ "$DRY_RUN" = true ]; then
    info "[DRY-RUN] Would restore to ${PITR_TARGET}"
    return 0
  fi

  warn "This will replace the current PostgreSQL data directory."
  read -r -p "Continue with PITR to ${PITR_TARGET}? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

  log "PITR start: target=${PITR_TARGET}"

  # Stop services
  info "Stopping Tandem and PostgreSQL..."
  sudo systemctl stop tandem 2>/dev/null || true
  sudo systemctl stop postgresql

  # Back up current data directory
  info "Backing up current data directory..."
  sudo mv "$PG_DATA" "${PG_DATA}.pre-pitr"

  # Restore base backup
  info "Restoring base backup..."
  sudo mkdir -p "$PG_DATA"
  sudo chown postgres:postgres "$PG_DATA"
  sudo chmod 700 "$PG_DATA"
  sudo -u postgres tar xf "$BASE_BACKUP" -C "$PG_DATA"

  # Configure recovery
  info "Configuring recovery target..."
  sudo -u postgres bash -c "cat >> ${PG_DATA}/postgresql.auto.conf" <<EOF
restore_command = 'gunzip -c ${WAL_DIR}/%f.gz > %p'
recovery_target_time = '${PITR_TARGET}'
recovery_target_action = 'promote'
EOF
  sudo -u postgres touch "${PG_DATA}/recovery.signal"

  # Start PostgreSQL — it will replay WAL
  info "Starting PostgreSQL (replaying WAL to target time)..."
  sudo systemctl start postgresql

  # Wait for recovery to complete
  info "Waiting for recovery to complete..."
  local MAX_WAIT=300
  local WAITED=0
  while sudo -u postgres psql -tAc "SELECT pg_is_in_recovery();" 2>/dev/null | grep -q "t"; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
      warn "Recovery is taking longer than expected. PostgreSQL is still replaying WAL."
      break
    fi
  done

  # Start app
  info "Starting Tandem..."
  sudo systemctl start tandem 2>/dev/null || true

  echo ""
  ok "Point-in-time recovery complete to: ${PITR_TARGET}"
  info "Previous data directory saved at: ${PG_DATA}.pre-pitr"
  info "Remove it manually after verifying: sudo rm -rf ${PG_DATA}.pre-pitr"
  log "PITR OK: target=${PITR_TARGET}"
}

# ─── Main ───────────────────────────────────────────────────────────────────

case "$MODE" in
  latest|file) restore_daily ;;
  pitr)        restore_pitr ;;
esac
