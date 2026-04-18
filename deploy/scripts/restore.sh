#!/usr/bin/env bash
# =============================================================================
# Tandem GTD — PostgreSQL Restore Script
# =============================================================================
# Restores a database from a backup file created by backup.sh.
#
# Usage:
#   ./scripts/restore.sh backups/tandem_20260221_120000.sql.gz
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
DB_USER="${POSTGRES_USER:-tandem}"
DB_NAME="${POSTGRES_DB:-tandem}"

# ---------------------------------------------------------------------------
# Validate arguments
# ---------------------------------------------------------------------------
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  echo ""
  echo "Example:"
  echo "  $0 backups/tandem_20260221_120000.sql.gz"
  echo ""
  echo "Available backups:"
  if [ -d "$DEPLOY_DIR/backups" ]; then
    ls -1t "$DEPLOY_DIR/backups"/tandem_*.sql.gz 2>/dev/null || echo "  (none found)"
  else
    echo "  (backup directory not found)"
  fi
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Tandem GTD — Database Restore"
echo "-----------------------------"
echo "  Database : $DB_NAME"
echo "  User     : $DB_USER"
echo "  Source   : $BACKUP_FILE"
echo ""
echo "WARNING: This will overwrite the current database contents."
read -r -p "Continue? [y/N] " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo ""
echo "Restoring database..."

# Decompress and pipe into psql inside the db container
gunzip -c "$BACKUP_FILE" \
  | docker compose -f "$DEPLOY_DIR/docker-compose.yml" exec -T db \
    psql -U "$DB_USER" -d "$DB_NAME" --single-transaction --set ON_ERROR_STOP=1

echo ""
echo "Restore complete."
echo "You may want to restart the app to clear any caches:"
echo "  docker compose -f $DEPLOY_DIR/docker-compose.yml restart app"
