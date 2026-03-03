#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — WAL Segment Archiver
# =============================================================================
# Called by PostgreSQL's archive_command. Compresses and stores WAL segments.
#
# Usage (in postgresql.conf):
#   archive_command = '/opt/tandem/scripts/archive-wal.sh %p %f'
#
# Arguments:
#   $1 = %p = full path to the WAL segment file
#   $2 = %f = filename of the WAL segment
# =============================================================================

WAL_PATH="${1:?Usage: archive-wal.sh <path> <filename>}"
WAL_FILE="${2:?Usage: archive-wal.sh <path> <filename>}"

# Project dir is two levels up from scripts/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WAL_DIR="${PROJECT_DIR}/backups/wal"
LOG_FILE="${PROJECT_DIR}/backups/dr.log"
RETAIN_DAYS="${BACKUP_RETAIN_WAL_DAYS:-14}"

mkdir -p "$WAL_DIR"

# Compress and archive
gzip -c "$WAL_PATH" > "${WAL_DIR}/${WAL_FILE}.gz"

# Log
echo "$(date -Iseconds) WAL archived: ${WAL_FILE}" >> "$LOG_FILE"

# Prune old WAL segments beyond retention
find "$WAL_DIR" -name "*.gz" -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true
