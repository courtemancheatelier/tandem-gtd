#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Off-Site Backup Setup Wizard
# =============================================================================
# Interactive setup for off-site backup replication targets.
#
# Usage:
#   ./scripts/setup-offsite.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }

ENV_FILE="${PROJECT_DIR}/.env"
[ -f "$ENV_FILE" ] || { echo "Error: .env not found. Run setup-local.sh first."; exit 1; }

# Helper to set/update a key in .env
set_env() {
  local KEY="$1" VALUE="$2"
  if grep -q "^${KEY}=" "$ENV_FILE"; then
    sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE" 2>/dev/null || \
    sed -i '' "s|^${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE"
  elif grep -q "^# *${KEY}=" "$ENV_FILE"; then
    sed -i "s|^# *${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE" 2>/dev/null || \
    sed -i '' "s|^# *${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE"
  else
    echo "${KEY}=${VALUE}" >> "$ENV_FILE"
  fi
}

echo ""
echo "Tandem GTD — Off-Site Backup Setup"
echo "===================================="
echo ""
echo "Which off-site method(s) do you want to configure?"
echo ""
echo "  [1] rsync/scp to another server (simplest)"
echo "  [2] S3-compatible storage (Backblaze B2, MinIO, AWS S3)"
echo "  [3] rclone (Google Drive, Dropbox, OneDrive, SFTP, etc.)"
echo "  [4] Skip for now"
echo ""
read -r -p "Select one or more (e.g., 1,2): " SELECTIONS

# ─── rsync ──────────────────────────────────────────────────────────────────

if echo "$SELECTIONS" | grep -q "1"; then
  echo ""
  echo "─── rsync/scp Setup ───"
  echo ""
  read -r -p "Remote target (e.g., user@backup-server:/backups/tandem): " RSYNC_TARGET
  read -r -p "SSH key path (default: ~/.ssh/id_tandem_backup): " SSH_KEY
  SSH_KEY="${SSH_KEY:-~/.ssh/id_tandem_backup}"
  read -r -p "Bandwidth limit in KB/s (0 = unlimited): " BWLIMIT
  BWLIMIT="${BWLIMIT:-0}"

  # Generate SSH key if it doesn't exist
  EXPANDED_KEY="${SSH_KEY/#\~/$HOME}"
  if [ ! -f "$EXPANDED_KEY" ]; then
    info "Generating SSH key at ${SSH_KEY}..."
    ssh-keygen -t ed25519 -f "$EXPANDED_KEY" -N "" -C "tandem-backup"
    ok "SSH key generated"
    echo ""
    warn "Add this public key to the remote server's authorized_keys:"
    echo ""
    cat "${EXPANDED_KEY}.pub"
    echo ""
    read -r -p "Press Enter when done..."
  fi

  set_env "BACKUP_RSYNC_ENABLED" "true"
  set_env "BACKUP_RSYNC_TARGET" "$RSYNC_TARGET"
  set_env "BACKUP_RSYNC_SSH_KEY" "$SSH_KEY"
  set_env "BACKUP_RSYNC_BANDWIDTH_LIMIT" "$BWLIMIT"

  # Test connection
  info "Testing rsync connection..."
  if rsync -e "ssh -i $EXPANDED_KEY" --dry-run /dev/null "${RSYNC_TARGET}/" 2>/dev/null; then
    ok "rsync connection successful"
  else
    warn "rsync connection test failed. Check your SSH key and target."
  fi
fi

# ─── S3 ─────────────────────────────────────────────────────────────────────

if echo "$SELECTIONS" | grep -q "2"; then
  echo ""
  echo "─── S3 Setup ───"
  echo ""
  read -r -p "S3 bucket name: " S3_BUCKET
  read -r -p "S3 endpoint URL (e.g., https://s3.us-west-000.backblazeb2.com): " S3_ENDPOINT
  read -r -p "S3 region (e.g., us-west-000): " S3_REGION
  read -r -p "Access key: " S3_ACCESS
  read -r -s -p "Secret key: " S3_SECRET
  echo ""

  set_env "BACKUP_S3_ENABLED" "true"
  set_env "BACKUP_S3_BUCKET" "$S3_BUCKET"
  set_env "BACKUP_S3_ENDPOINT" "$S3_ENDPOINT"
  set_env "BACKUP_S3_REGION" "${S3_REGION:-us-east-1}"
  set_env "BACKUP_S3_ACCESS_KEY" "$S3_ACCESS"
  set_env "BACKUP_S3_SECRET_KEY" "$S3_SECRET"

  # Configure aws CLI credentials
  if command -v aws >/dev/null 2>&1; then
    info "Testing S3 connection..."
    if AWS_ACCESS_KEY_ID="$S3_ACCESS" AWS_SECRET_ACCESS_KEY="$S3_SECRET" \
       aws s3 ls "s3://${S3_BUCKET}/" --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" 2>/dev/null; then
      ok "S3 connection successful"
    else
      warn "S3 connection test failed. Check your credentials and bucket."
    fi
  else
    warn "aws CLI not installed. Install it to use S3 replication."
  fi
fi

# ─── rclone ─────────────────────────────────────────────────────────────────

if echo "$SELECTIONS" | grep -q "3"; then
  echo ""
  echo "─── rclone Setup ───"
  echo ""

  if ! command -v rclone >/dev/null 2>&1; then
    warn "rclone is not installed."
    echo "  Install: curl https://rclone.org/install.sh | sudo bash"
    echo ""
    read -r -p "Install rclone now? [y/N] " INSTALL_RCLONE
    if [[ "$INSTALL_RCLONE" =~ ^[Yy]$ ]]; then
      curl https://rclone.org/install.sh | sudo bash
    fi
  fi

  if command -v rclone >/dev/null 2>&1; then
    info "Running rclone config — set up a new remote for backups"
    rclone config

    read -r -p "Remote name and path (e.g., gdrive:tandem-backups): " RCLONE_REMOTE
    read -r -p "Bandwidth limit in KB/s (0 = unlimited): " RCLONE_BWLIMIT
    RCLONE_BWLIMIT="${RCLONE_BWLIMIT:-0}"

    set_env "BACKUP_RCLONE_ENABLED" "true"
    set_env "BACKUP_RCLONE_REMOTE" "$RCLONE_REMOTE"
    set_env "BACKUP_RCLONE_BANDWIDTH_LIMIT" "$RCLONE_BWLIMIT"
  fi
fi

# ─── Done ───────────────────────────────────────────────────────────────────

if echo "$SELECTIONS" | grep -q "4"; then
  info "Off-site replication skipped. You can run this wizard again later."
fi

echo ""
ok "Off-site setup complete. Settings saved to .env"
echo ""
