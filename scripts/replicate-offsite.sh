#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Off-Site Backup Replication
# =============================================================================
# Pushes local backups to configured off-site targets (rsync, S3, rclone).
#
# Usage:
#   ./scripts/replicate-offsite.sh
#   ./scripts/replicate-offsite.sh --quiet
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
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }

# ─── Load config ────────────────────────────────────────────────────────────

ENV_FILE="${PROJECT_DIR}/.env"
[ -f "$ENV_FILE" ] || { fail ".env not found"; exit 1; }
set -a; source "$ENV_FILE"; set +a

BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${BACKUP_DIR}/dr.log"
ISO_TS=$(date -Iseconds)

EXIT_CODE=0

# ─── rsync ──────────────────────────────────────────────────────────────────

if [ "${BACKUP_RSYNC_ENABLED:-false}" = "true" ]; then
  RSYNC_TARGET="${BACKUP_RSYNC_TARGET:-}"
  SSH_KEY="${BACKUP_RSYNC_SSH_KEY:-}"
  BWLIMIT="${BACKUP_RSYNC_BANDWIDTH_LIMIT:-0}"

  if [ -z "$RSYNC_TARGET" ]; then
    warn "BACKUP_RSYNC_TARGET is not set. Skipping rsync."
  else
    info "Replicating to rsync target: ${RSYNC_TARGET}"
    RSYNC_OPTS=(-avz --delete)
    [ -n "$SSH_KEY" ] && RSYNC_OPTS+=(-e "ssh -i $SSH_KEY")
    [ "$BWLIMIT" -gt 0 ] 2>/dev/null && RSYNC_OPTS+=(--bwlimit="$BWLIMIT")

    if rsync "${RSYNC_OPTS[@]}" "${BACKUP_DIR}/daily/" "${BACKUP_DIR}/weekly/" "${RSYNC_TARGET}/" 2>&1; then
      ok "rsync replication complete"
      echo "$ISO_TS REPLICATE rsync OK: ${RSYNC_TARGET}" >> "$LOG_FILE"
    else
      warn "rsync replication failed"
      echo "$ISO_TS REPLICATE rsync FAILED: ${RSYNC_TARGET}" >> "$LOG_FILE"
      EXIT_CODE=2
    fi
  fi
fi

# ─── S3 ─────────────────────────────────────────────────────────────────────

if [ "${BACKUP_S3_ENABLED:-false}" = "true" ]; then
  S3_BUCKET="${BACKUP_S3_BUCKET:-}"
  S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
  S3_REGION="${BACKUP_S3_REGION:-us-east-1}"

  if [ -z "$S3_BUCKET" ]; then
    warn "BACKUP_S3_BUCKET is not set. Skipping S3."
  elif ! command -v aws >/dev/null 2>&1; then
    warn "aws CLI not installed. Skipping S3."
  else
    info "Replicating to S3: s3://${S3_BUCKET}"

    S3_CMD=(aws s3 sync)
    [ -n "$S3_ENDPOINT" ] && S3_CMD+=(--endpoint-url "$S3_ENDPOINT")
    S3_CMD+=(--region "$S3_REGION")

    # Sync daily
    if "${S3_CMD[@]}" "${BACKUP_DIR}/daily/" "s3://${S3_BUCKET}/daily/" 2>&1; then
      ok "S3 daily sync complete"
    else
      warn "S3 daily sync failed"
      EXIT_CODE=2
    fi

    # Sync weekly
    if "${S3_CMD[@]}" "${BACKUP_DIR}/weekly/" "s3://${S3_BUCKET}/weekly/" 2>&1; then
      ok "S3 weekly sync complete"
    else
      warn "S3 weekly sync failed"
      EXIT_CODE=2
    fi

    echo "$ISO_TS REPLICATE s3 $([ $EXIT_CODE -eq 0 ] && echo OK || echo PARTIAL): s3://${S3_BUCKET}" >> "$LOG_FILE"
  fi
fi

# ─── rclone ─────────────────────────────────────────────────────────────────

if [ "${BACKUP_RCLONE_ENABLED:-false}" = "true" ]; then
  RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
  BWLIMIT="${BACKUP_RCLONE_BANDWIDTH_LIMIT:-0}"

  if [ -z "$RCLONE_REMOTE" ]; then
    warn "BACKUP_RCLONE_REMOTE is not set. Skipping rclone."
  elif ! command -v rclone >/dev/null 2>&1; then
    warn "rclone not installed. Skipping."
  else
    info "Replicating to rclone remote: ${RCLONE_REMOTE}"

    RCLONE_OPTS=(sync --checksum)
    [ "$BWLIMIT" -gt 0 ] 2>/dev/null && RCLONE_OPTS+=(--bwlimit "${BWLIMIT}k")

    if rclone "${RCLONE_OPTS[@]}" "${BACKUP_DIR}/daily/" "${RCLONE_REMOTE}/daily/" 2>&1 && \
       rclone "${RCLONE_OPTS[@]}" "${BACKUP_DIR}/weekly/" "${RCLONE_REMOTE}/weekly/" 2>&1; then
      ok "rclone replication complete"
      echo "$ISO_TS REPLICATE rclone OK: ${RCLONE_REMOTE}" >> "$LOG_FILE"
    else
      warn "rclone replication failed"
      echo "$ISO_TS REPLICATE rclone FAILED: ${RCLONE_REMOTE}" >> "$LOG_FILE"
      EXIT_CODE=2
    fi
  fi
fi

# ─── Summary ────────────────────────────────────────────────────────────────

if [ "${BACKUP_RSYNC_ENABLED:-false}" != "true" ] && \
   [ "${BACKUP_S3_ENABLED:-false}" != "true" ] && \
   [ "${BACKUP_RCLONE_ENABLED:-false}" != "true" ]; then
  info "No off-site targets configured. Skipping replication."
fi

exit $EXIT_CODE
