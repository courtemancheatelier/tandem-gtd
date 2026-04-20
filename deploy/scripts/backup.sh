#!/usr/bin/env bash
# =============================================================================
# Tandem GTD — PostgreSQL Backup Script
# =============================================================================
# Creates a timestamped pg_dump backup of the Tandem database.
#
# Usage:
#   ./scripts/backup.sh                    # backs up to ./backups/
#   ./scripts/backup.sh /path/to/dir       # backs up to the given directory
#   COMPOSE_FILE=docker-compose.yml ./scripts/backup.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$DEPLOY_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DEPLOY_DIR/.env"
  set +a
fi

# Configuration
BACKUP_DIR="${1:-$DEPLOY_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DB_USER="${POSTGRES_USER:-tandem}"
DB_NAME="${POSTGRES_DB:-tandem}"
BACKUP_FILE="$BACKUP_DIR/tandem_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Tandem GTD — Database Backup"
echo "----------------------------"
echo "  Database : $DB_NAME"
echo "  User     : $DB_USER"
echo "  Target   : $BACKUP_FILE"
echo ""

# Run pg_dump inside the db container, compress, and save locally
docker compose -f "$DEPLOY_DIR/docker-compose.yml" exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip > "$BACKUP_FILE"

# Verify the backup is non-empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file is empty. Something went wrong."
  rm -f "$BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"

# Optionally prune old backups (keep last 30)
BACKUP_COUNT="$(find "$BACKUP_DIR" -name "tandem_*.sql.gz" -type f | wc -l | tr -d ' ')"
if [ "$BACKUP_COUNT" -gt 30 ]; then
  PRUNE_COUNT=$((BACKUP_COUNT - 30))
  echo "Pruning $PRUNE_COUNT old backup(s)..."
  find "$BACKUP_DIR" -name "tandem_*.sql.gz" -type f \
    | sort \
    | head -n "$PRUNE_COUNT" \
    | xargs rm -f
fi
