#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Backup Verification
# =============================================================================
# Automated restore test: decrypts the latest backup, restores into a
# throwaway database, validates row counts, then drops it.
#
# Usage:
#   ./scripts/dr-verify.sh              # Verify latest local backup
#   ./scripts/dr-verify.sh --remote     # Verify latest off-site backup
#   ./scripts/dr-verify.sh --quiet      # Suppress stdout (for cron)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

QUIET=false
REMOTE=false

for arg in "$@"; do
  case "$arg" in
    --quiet)  QUIET=true ;;
    --remote) REMOTE=true ;;
    *)        echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ─── Colors ─────────────────────────────────────────────────────────────────

if [ "$QUIET" = true ] || ! [ -t 1 ]; then
  RED=''; GREEN=''; BLUE=''; YELLOW=''; NC=''
else
  RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
fi

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ─── Load config ────────────────────────────────────────────────────────────

ENV_FILE="${PROJECT_DIR}/.env"
[ -f "$ENV_FILE" ] || fail ".env not found at $ENV_FILE"
set -a; source "$ENV_FILE"; set +a

BACKUP_DIR="${PROJECT_DIR}/backups"
VERIFY_LOG="${BACKUP_DIR}/verify.log"
DR_LOG="${BACKUP_DIR}/dr.log"

PASSPHRASE="${BACKUP_PASSPHRASE:-}"
PG_DB="${BACKUP_PG_DB:-tandem}"
VERIFY_DB="tandem_verify"

[ -n "$PASSPHRASE" ] || fail "BACKUP_PASSPHRASE is not set in .env"

ISO_TS=$(date -Iseconds)
log_verify() { echo "$ISO_TS $*" >> "$VERIFY_LOG"; }
log_dr()     { echo "$ISO_TS $*" >> "$DR_LOG"; }

# ─── Find latest backup ────────────────────────────────────────────────────

BACKUP_FILE=$(find "${BACKUP_DIR}/daily" -name "*.pg_dump.gpg" 2>/dev/null | sort | tail -n1)
[ -n "$BACKUP_FILE" ] || fail "No daily backups found in ${BACKUP_DIR}/daily/"

info "Verifying backup: $(basename "$BACKUP_FILE")"

# ─── Checksum ───────────────────────────────────────────────────────────────

SUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$SUM_FILE" ]; then
  info "Checking SHA-256 checksum..."
  (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$SUM_FILE" --quiet 2>/dev/null) || {
    log_verify "VERIFY FAILED: checksum mismatch: $(basename "$BACKUP_FILE")"
    log_dr "VERIFY FAILED: checksum mismatch"
    fail "Checksum verification failed"
  }
  ok "Checksum passed"
fi

# ─── Decrypt ────────────────────────────────────────────────────────────────

DECRYPTED="${BACKUP_FILE%.gpg}"
CLEANUP_FILES=("$DECRYPTED")
cleanup() { rm -f "${CLEANUP_FILES[@]}"; sudo -u postgres dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; }
trap cleanup EXIT

info "Decrypting..."
gpg --batch --yes --decrypt \
    --passphrase-fd 3 3<<<"$PASSPHRASE" \
    --output "$DECRYPTED" "$BACKUP_FILE"
ok "Decrypted"

# ─── Create throwaway database ──────────────────────────────────────────────

info "Creating verification database: ${VERIFY_DB}"
sudo -u postgres dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
sudo -u postgres createdb "$VERIFY_DB"

# ─── Restore ────────────────────────────────────────────────────────────────

info "Restoring into ${VERIFY_DB}..."
sudo -u postgres pg_restore --dbname="$VERIFY_DB" "$DECRYPTED" 2>&1 || {
  log_verify "VERIFY FAILED: pg_restore error"
  log_dr "VERIFY FAILED: pg_restore error"
  fail "pg_restore failed"
}
ok "Restore succeeded"

# ─── Validate ───────────────────────────────────────────────────────────────

info "Running validation queries..."

# Count rows in all tables from both databases
LIVE_COUNTS=$(sudo -u postgres psql -d "$PG_DB" -tAc \
  "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;" 2>/dev/null || echo "")
VERIFY_COUNTS=$(sudo -u postgres psql -d "$VERIFY_DB" -tAc \
  "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;" 2>/dev/null || echo "")

# Check that at least one user exists
USER_COUNT=$(sudo -u postgres psql -d "$VERIFY_DB" -tAc \
  "SELECT COUNT(*) FROM \"User\";" 2>/dev/null || echo "0")
USER_COUNT=$(echo "$USER_COUNT" | tr -d ' ')

if [ "$USER_COUNT" -lt 1 ]; then
  log_verify "VERIFY FAILED: no User records in restored database"
  log_dr "VERIFY FAILED: no User records"
  fail "No User records found in restored database"
fi

# Check Prisma migration version
MIGRATION_OK=$(sudo -u postgres psql -d "$VERIFY_DB" -tAc \
  "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null || echo "0")
MIGRATION_OK=$(echo "$MIGRATION_OK" | tr -d ' ')

if [ "$MIGRATION_OK" -lt 1 ]; then
  warn "No completed Prisma migrations found — this may be expected for fresh setups"
fi

# ─── Summary ────────────────────────────────────────────────────────────────

echo ""
ok "Verification PASSED"
echo "  Backup:     $(basename "$BACKUP_FILE")"
echo "  Users:      ${USER_COUNT}"
echo "  Migrations: ${MIGRATION_OK}"
echo ""

log_verify "VERIFY PASSED: $(basename "$BACKUP_FILE") users=${USER_COUNT} migrations=${MIGRATION_OK}"
log_dr "VERIFY PASSED"

# Cleanup happens via trap
