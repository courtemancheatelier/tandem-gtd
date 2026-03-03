#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Disaster Recovery Status Dashboard
# =============================================================================
# Shows backup health at a glance.
#
# Usage:
#   ./scripts/dr-status.sh           # Human-readable dashboard
#   ./scripts/dr-status.sh --json    # Machine-readable JSON
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

JSON=false
[ "${1:-}" = "--json" ] && JSON=true

# ─── Load config ────────────────────────────────────────────────────────────

ENV_FILE="${PROJECT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

BACKUP_DIR="${PROJECT_DIR}/backups"
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
WAL_DIR="${BACKUP_DIR}/wal"
BASE_DIR="${BACKUP_DIR}/wal-base"
VERIFY_LOG="${BACKUP_DIR}/verify.log"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'

check() { echo -e "  ${GREEN}✓${NC}"; }
warn_mark() { echo -e "  ${YELLOW}!${NC}"; }
fail_mark() { echo -e "  ${RED}✗${NC}"; }

# ─── Gather data ────────────────────────────────────────────────────────────

# Daily backups
DAILY_COUNT=$(find "$DAILY_DIR" -name "*.pg_dump.gpg" 2>/dev/null | wc -l | tr -d ' ')
DAILY_RETAIN="${BACKUP_RETAIN_DAILY:-30}"
LAST_DAILY=""
LAST_DAILY_AGE=""
if [ "$DAILY_COUNT" -gt 0 ]; then
  LAST_DAILY_FILE=$(find "$DAILY_DIR" -name "*.pg_dump.gpg" 2>/dev/null | sort | tail -n1)
  LAST_DAILY=$(stat -c %y "$LAST_DAILY_FILE" 2>/dev/null | cut -d. -f1 || \
               stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LAST_DAILY_FILE" 2>/dev/null || echo "unknown")
  # Age in hours
  LAST_DAILY_EPOCH=$(stat -c %Y "$LAST_DAILY_FILE" 2>/dev/null || stat -f %m "$LAST_DAILY_FILE" 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  LAST_DAILY_AGE=$(( (NOW_EPOCH - LAST_DAILY_EPOCH) / 3600 ))
fi

# Weekly backups
WEEKLY_COUNT=$(find "$WEEKLY_DIR" -name "*.tar.gz.gpg" 2>/dev/null | wc -l | tr -d ' ')
WEEKLY_RETAIN="${BACKUP_RETAIN_WEEKLY:-12}"
LAST_WEEKLY=""
if [ "$WEEKLY_COUNT" -gt 0 ]; then
  LAST_WEEKLY_FILE=$(find "$WEEKLY_DIR" -name "*.tar.gz.gpg" 2>/dev/null | sort | tail -n1)
  LAST_WEEKLY=$(stat -c %y "$LAST_WEEKLY_FILE" 2>/dev/null | cut -d. -f1 || \
                stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LAST_WEEKLY_FILE" 2>/dev/null || echo "unknown")
fi

# Disk usage
DISK_USAGE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "?")

# WAL archiving
WAL_ENABLED="${BACKUP_WAL_ENABLED:-false}"
WAL_COUNT=0
if [ -d "$WAL_DIR" ]; then
  WAL_COUNT=$(find "$WAL_DIR" -name "*.gz" 2>/dev/null | wc -l | tr -d ' ')
fi
WAL_SIZE=$(du -sh "$WAL_DIR" 2>/dev/null | cut -f1 || echo "0")

BASE_COUNT=0
LAST_BASE=""
if [ -d "$BASE_DIR" ]; then
  BASE_COUNT=$(find "$BASE_DIR" -name "base_*.tar.gz" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$BASE_COUNT" -gt 0 ]; then
    LAST_BASE_FILE=$(find "$BASE_DIR" -name "base_*.tar.gz" 2>/dev/null | sort | tail -n1)
    LAST_BASE=$(stat -c %y "$LAST_BASE_FILE" 2>/dev/null | cut -d. -f1 || \
                stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LAST_BASE_FILE" 2>/dev/null || echo "unknown")
  fi
fi

# Last verification
LAST_VERIFY=""
LAST_VERIFY_RESULT=""
if [ -f "$VERIFY_LOG" ]; then
  LAST_VERIFY_LINE=$(grep "VERIFY" "$VERIFY_LOG" 2>/dev/null | tail -n1)
  if [ -n "$LAST_VERIFY_LINE" ]; then
    LAST_VERIFY=$(echo "$LAST_VERIFY_LINE" | cut -d' ' -f1)
    if echo "$LAST_VERIFY_LINE" | grep -q "PASSED"; then
      LAST_VERIFY_RESULT="PASSED"
    else
      LAST_VERIFY_RESULT="FAILED"
    fi
  fi
fi

# Encryption
PASSPHRASE_SET="No"
[ -n "${BACKUP_PASSPHRASE:-}" ] && PASSPHRASE_SET="Yes"
GPG_VERSION=$(gpg --version 2>/dev/null | head -n1 | awk '{print $NF}' || echo "not installed")

# Services
check_service() {
  if systemctl is-active --quiet "$1" 2>/dev/null; then
    echo "active (running)"
  else
    echo "inactive"
  fi
}

PG_STATUS=$(check_service postgresql)
TANDEM_STATUS=$(check_service tandem)

# Off-site
RSYNC_ENABLED="${BACKUP_RSYNC_ENABLED:-false}"
S3_ENABLED="${BACKUP_S3_ENABLED:-false}"
RCLONE_ENABLED="${BACKUP_RCLONE_ENABLED:-false}"

# ─── JSON output ────────────────────────────────────────────────────────────

if [ "$JSON" = true ]; then
  cat <<ENDJSON
{
  "daily": { "count": $DAILY_COUNT, "retain": $DAILY_RETAIN, "last": "$LAST_DAILY" },
  "weekly": { "count": $WEEKLY_COUNT, "retain": $WEEKLY_RETAIN, "last": "$LAST_WEEKLY" },
  "disk_usage": "$DISK_USAGE",
  "wal": { "enabled": $WAL_ENABLED, "segments": $WAL_COUNT, "size": "$WAL_SIZE", "base_backups": $BASE_COUNT },
  "verification": { "last": "$LAST_VERIFY", "result": "$LAST_VERIFY_RESULT" },
  "encryption": { "passphrase_set": $( [ "$PASSPHRASE_SET" = "Yes" ] && echo true || echo false ), "gpg_version": "$GPG_VERSION" },
  "offsite": { "rsync": $RSYNC_ENABLED, "s3": $S3_ENABLED, "rclone": $RCLONE_ENABLED },
  "services": { "postgresql": "$PG_STATUS", "tandem": "$TANDEM_STATUS" }
}
ENDJSON
  exit 0
fi

# ─── Human dashboard ───────────────────────────────────────────────────────

echo ""
echo "Tandem GTD — Disaster Recovery Status"
echo "======================================"
echo ""

echo "  Local Backups"
echo "  ─────────────"
if [ "$DAILY_COUNT" -gt 0 ]; then
  STATUS=$(check)
  [ "$LAST_DAILY_AGE" -gt 25 ] && STATUS=$(warn_mark)
  printf "  Last daily snapshot:    %-35s (%s hours ago)%s\n" "$LAST_DAILY" "$LAST_DAILY_AGE" "$STATUS"
else
  printf "  Last daily snapshot:    %-35s%s\n" "(none)" "$(fail_mark)"
fi
if [ "$WEEKLY_COUNT" -gt 0 ]; then
  printf "  Last weekly full:       %-35s%s\n" "$LAST_WEEKLY" "$(check)"
else
  printf "  Last weekly full:       %-35s%s\n" "(none)" "$(warn_mark)"
fi
echo "  Daily snapshots:        ${DAILY_COUNT} of ${DAILY_RETAIN} retained"
echo "  Weekly snapshots:       ${WEEKLY_COUNT} of ${WEEKLY_RETAIN} retained"
echo "  Local disk usage:       ${DISK_USAGE}"
echo ""

echo "  WAL Archiving"
echo "  ─────────────"
if [ "$WAL_ENABLED" = "true" ]; then
  printf "  Status:                 %-35s%s\n" "ENABLED" "$(check)"
  echo "  WAL segments:           ${WAL_COUNT}"
  echo "  WAL archive size:       ${WAL_SIZE}"
  if [ -n "$LAST_BASE" ]; then
    printf "  Last base backup:       %-35s%s\n" "$LAST_BASE" "$(check)"
  else
    printf "  Last base backup:       %-35s%s\n" "(none)" "$(warn_mark)"
  fi
else
  printf "  Status:                 %-35s%s\n" "DISABLED" "$(warn_mark)"
fi
echo ""

echo "  Off-Site Replication"
echo "  ────────────────────"
[ "$RSYNC_ENABLED" = "true" ] && printf "  rsync:                  %-35s%s\n" "Configured" "$(check)" || printf "  rsync:                  Not configured\n"
[ "$S3_ENABLED" = "true" ]    && printf "  S3:                     %-35s%s\n" "Configured" "$(check)" || printf "  S3:                     Not configured\n"
[ "$RCLONE_ENABLED" = "true" ] && printf "  rclone:                 %-35s%s\n" "Configured" "$(check)" || printf "  rclone:                 Not configured\n"
echo ""

echo "  Verification"
echo "  ────────────"
if [ -n "$LAST_VERIFY" ]; then
  local_status=$(check)
  [ "$LAST_VERIFY_RESULT" = "FAILED" ] && local_status=$(fail_mark)
  printf "  Last restore test:      %-20s %-15s%s\n" "$LAST_VERIFY" "$LAST_VERIFY_RESULT" "$local_status"
else
  printf "  Last restore test:      %-35s%s\n" "(never run)" "$(warn_mark)"
fi
echo ""

echo "  Encryption"
echo "  ──────────"
printf "  Passphrase configured:  %-35s%s\n" "$PASSPHRASE_SET" "$( [ "$PASSPHRASE_SET" = "Yes" ] && check || fail_mark)"
printf "  GPG available:          %-35s%s\n" "$GPG_VERSION" "$( [ "$GPG_VERSION" != "not installed" ] && check || fail_mark)"
echo ""

echo "  Services"
echo "  ────────"
printf "  postgresql.service:     %-35s%s\n" "$PG_STATUS" "$( echo "$PG_STATUS" | grep -q "active" && check || fail_mark)"
printf "  tandem.service:         %-35s%s\n" "$TANDEM_STATUS" "$( echo "$TANDEM_STATUS" | grep -q "active" && check || fail_mark)"
echo ""
