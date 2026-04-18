#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — WAL Base Backup
# =============================================================================
# Takes a pg_basebackup as the PITR anchor point. Run weekly.
#
# Usage:
#   ./scripts/wal-basebackup.sh
#   ./scripts/wal-basebackup.sh --quiet
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

QUIET=false
[ "${1:-}" = "--quiet" ] && QUIET=true

if [ "$QUIET" = true ] || ! [ -t 1 ]; then
  RED=''; GREEN=''; BLUE=''; YELLOW=''; NC=''
else
  RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
fi

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ─── Load config ────────────────────────────────────────────────────────────

ENV_FILE="${PROJECT_DIR}/.env"
[ -f "$ENV_FILE" ] || fail ".env not found"
set -a; source "$ENV_FILE"; set +a

WAL_ENABLED="${BACKUP_WAL_ENABLED:-false}"
if [ "$WAL_ENABLED" != "true" ]; then
  info "WAL archiving is disabled (BACKUP_WAL_ENABLED=false). Skipping."
  exit 0
fi

BASE_DIR="${PROJECT_DIR}/backups/wal-base"
LOG_FILE="${PROJECT_DIR}/backups/dr.log"
RETAIN_DAYS="${BACKUP_RETAIN_WAL_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BASE_DIR"

# ─── Take base backup ──────────────────────────────────────────────────────

BASE_FILE="${BASE_DIR}/base_${TIMESTAMP}.tar.gz"

info "Starting pg_basebackup..."
sudo -u postgres pg_basebackup \
    --pgdata=- \
    --format=tar \
    --gzip \
    --checkpoint=fast \
    --wal-method=none \
    > "$BASE_FILE" 2>&1 || {
  echo "$(date -Iseconds) WAL-BASE FAILED: pg_basebackup error" >> "$LOG_FILE"
  fail "pg_basebackup failed"
}

SIZE=$(du -h "$BASE_FILE" | cut -f1)
ok "Base backup complete: $(basename "$BASE_FILE") (${SIZE})"
echo "$(date -Iseconds) WAL-BASE OK: $(basename "$BASE_FILE") (${SIZE})" >> "$LOG_FILE"

# ─── Prune old base backups ────────────────────────────────────────────────

find "$BASE_DIR" -name "base_*.tar.gz" -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true
