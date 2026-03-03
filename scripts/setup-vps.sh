#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — VPS Provisioning Script
# =============================================================================
# Automated setup for a fresh Ubuntu 22.04/24.04 VPS.
# Installs all dependencies, configures PostgreSQL, builds the app, and starts
# the systemd service. Run as root.
#
# Usage:
#   sudo bash scripts/setup-vps.sh [OPTIONS]
#
# Options:
#   --repo <url>       Git repo URL (default: current directory if already cloned)
#   --branch <branch>  Git branch to checkout (default: main)
#   --seed             Seed the database with demo accounts after migration
#
# Example:
#   sudo bash scripts/setup-vps.sh --repo https://github.com/you/tandem.git --seed
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# =============================================================================
# Parse arguments
# =============================================================================
REPO_URL=""
BRANCH="main"
SEED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)   REPO_URL="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --seed)   SEED=true; shift ;;
    *)        error "Unknown option: $1" ;;
  esac
done

INSTALL_DIR="/opt/tandem"

# =============================================================================
# Step 1: Validate environment
# =============================================================================
echo ""
echo "========================================"
echo "  Tandem GTD — VPS Setup"
echo "========================================"
echo ""

[[ $EUID -eq 0 ]] || error "This script must be run as root (sudo)."

# Check Ubuntu version
if [ -f /etc/os-release ]; then
  . /etc/os-release
  [[ "$ID" == "ubuntu" ]] || error "This script requires Ubuntu. Detected: $ID"
  UBUNTU_CODENAME="$VERSION_CODENAME"
  case "$UBUNTU_CODENAME" in
    jammy|noble) ok "Ubuntu $VERSION_ID ($UBUNTU_CODENAME) detected" ;;
    *) error "Unsupported Ubuntu version: $VERSION_ID ($UBUNTU_CODENAME). Need 22.04 (jammy) or 24.04 (noble)." ;;
  esac
else
  error "Cannot determine OS. /etc/os-release not found."
fi

# =============================================================================
# Step 2: Install system packages
# =============================================================================
info "Updating package lists..."
apt-get update -qq

info "Installing system packages..."
apt-get install -y -qq curl git ufw jq build-essential gnupg lsb-release ca-certificates > /dev/null
ok "System packages installed"

# =============================================================================
# Step 3: Create tandem system user
# =============================================================================
if id "tandem" &>/dev/null; then
  ok "User 'tandem' already exists"
else
  info "Creating system user 'tandem'..."
  useradd --system --create-home --home-dir /home/tandem --shell /usr/sbin/nologin tandem
  ok "User 'tandem' created"
fi

# =============================================================================
# Step 4: Install Node.js 22
# =============================================================================
if command -v node &>/dev/null && node --version | grep -q "v22"; then
  ok "Node.js $(node --version) already installed"
else
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
  ok "Node.js $(node --version) installed"
fi

# =============================================================================
# Step 5: Install PostgreSQL 16
# =============================================================================
if command -v psql &>/dev/null && psql --version | grep -q "16"; then
  ok "PostgreSQL 16 already installed"
else
  info "Installing PostgreSQL 16..."

  # Add PostgreSQL apt repo
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --yes --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg 2>/dev/null
  chmod 644 /usr/share/keyrings/postgresql-archive-keyring.gpg

  # Try the current codename first, fall back to jammy
  PG_CODENAME="$UBUNTU_CODENAME"
  echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt ${PG_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list

  apt-get update -qq
  if ! apt-get install -y -qq postgresql-16 > /dev/null 2>&1; then
    if [[ "$PG_CODENAME" != "jammy" ]]; then
      warn "PostgreSQL packages not available for $PG_CODENAME, falling back to jammy..."
      echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt jammy-pgdg main" > /etc/apt/sources.list.d/pgdg.list
      apt-get update -qq
      apt-get install -y -qq postgresql-16 > /dev/null
    else
      error "Failed to install PostgreSQL 16"
    fi
  fi

  systemctl enable postgresql
  systemctl start postgresql
  ok "PostgreSQL 16 installed and running"
fi

# =============================================================================
# Step 6: Create PostgreSQL user + database
# =============================================================================
DB_USER="tandem"
DB_NAME="tandem"
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"

info "Configuring PostgreSQL..."

# Create user if it doesn't exist
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  warn "PostgreSQL user '${DB_USER}' already exists — updating password"
  sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" > /dev/null
else
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" > /dev/null
fi

# Create database if it doesn't exist
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "Database '${DB_NAME}' already exists"
else
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null
  ok "Database '${DB_NAME}' created"
fi

# Grant permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null
ok "PostgreSQL configured (user: ${DB_USER}, db: ${DB_NAME})"

# =============================================================================
# Step 7: Clone or prepare repo
# =============================================================================
if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "$INSTALL_DIR already exists with a git repo — pulling latest"
    cd "$INSTALL_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull --ff-only
  else
    info "Cloning repo to $INSTALL_DIR..."
    git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
elif [[ -d "$INSTALL_DIR" ]]; then
  ok "Using existing installation at $INSTALL_DIR"
else
  # Check if we're running from within the repo
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
  if [[ -f "$SOURCE_DIR/package.json" ]]; then
    info "Copying project to $INSTALL_DIR..."
    cp -a "$SOURCE_DIR" "$INSTALL_DIR"
  else
    error "No repo found. Use --repo <url> to specify the git repository."
  fi
fi

cd "$INSTALL_DIR"

# Create backups directory
mkdir -p "$INSTALL_DIR/backups"

# =============================================================================
# Step 8: Generate .env from production template
# =============================================================================
ENV_FILE="$INSTALL_DIR/.env"
TEMPLATE="$INSTALL_DIR/deploy/.env.production.template"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — skipping generation (delete it to regenerate)"
else
  [[ -f "$TEMPLATE" ]] || error "Template not found: $TEMPLATE"

  info "Generating .env from production template..."

  NEXTAUTH_SECRET="$(openssl rand -base64 48)"
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
  BACKUP_PASSPHRASE="$(openssl rand -base64 48)"

  cp "$TEMPLATE" "$ENV_FILE"

  sed -i "s|GENERATED_DB_PASSWORD|${DB_PASSWORD}|g" "$ENV_FILE"
  sed -i "s|https://GENERATED_DOMAIN|http://localhost:2000|g" "$ENV_FILE"
  sed -i "s|GENERATED_NEXTAUTH_SECRET|${NEXTAUTH_SECRET}|g" "$ENV_FILE"
  sed -i "s|GENERATED_ENCRYPTION_KEY|${ENCRYPTION_KEY}|g" "$ENV_FILE"
  sed -i "s|GENERATED_BACKUP_PASSPHRASE|${BACKUP_PASSPHRASE}|g" "$ENV_FILE"

  chmod 600 "$ENV_FILE"
  ok ".env generated with fresh secrets"
fi

# =============================================================================
# Step 9: Install dependencies + build
# =============================================================================
info "Installing Node.js dependencies..."
npm ci 2>&1 | tail -1
ok "Dependencies installed"

info "Generating Prisma client..."
npx prisma generate
ok "Prisma client generated"

info "Running database migrations..."
npx prisma migrate deploy
ok "Migrations applied"

# Optionally seed
if [[ "$SEED" == true ]]; then
  info "Seeding database..."
  npx prisma db seed || warn "Seeding failed (may already be seeded)"
fi

info "Building production bundle..."
npm run build 2>&1 | tail -5
ok "Build complete"

# Prune dev dependencies after build
info "Pruning dev dependencies..."
npm prune --omit=dev 2>&1 | tail -1
ok "Dev dependencies pruned"

# Copy public + static into standalone
info "Preparing standalone output..."
cp -r public .next/standalone/ 2>/dev/null || true
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
ok "Standalone bundle ready"

# =============================================================================
# Step 10: Set ownership
# =============================================================================
info "Setting file ownership..."
chown -R tandem:tandem "$INSTALL_DIR"
ok "Ownership set to tandem:tandem"

# =============================================================================
# Step 11: Install systemd service
# =============================================================================
info "Installing systemd service..."
cp "$INSTALL_DIR/scripts/tandem.service" /etc/systemd/system/tandem.service
systemctl daemon-reload
systemctl enable tandem
systemctl start tandem
ok "Systemd service installed and started"

# =============================================================================
# Step 12: Configure UFW
# =============================================================================
info "Configuring firewall..."
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh > /dev/null
ufw --force enable > /dev/null
ok "UFW enabled (SSH only — no HTTP/HTTPS ports open)"

# =============================================================================
# Step 13: Sudoers for tandem user (backup scripts)
# =============================================================================
info "Configuring sudoers for backup scripts..."
tee /etc/sudoers.d/tandem-backup > /dev/null << 'EOF'
tandem ALL=(postgres) NOPASSWD: /usr/bin/pg_dump, /usr/bin/pg_restore, /usr/bin/pg_basebackup, /usr/bin/psql, /usr/bin/createdb, /usr/bin/dropdb
tandem ALL=(root) NOPASSWD: /usr/bin/systemctl stop tandem, /usr/bin/systemctl start tandem, /usr/bin/systemctl restart tandem
tandem ALL=(root) NOPASSWD: /usr/bin/systemctl stop postgresql, /usr/bin/systemctl start postgresql, /usr/bin/systemctl restart postgresql
EOF
chmod 440 /etc/sudoers.d/tandem-backup
ok "Sudoers configured"

# =============================================================================
# Step 14: Health check
# =============================================================================
info "Waiting for Tandem to start..."
sleep 3

HEALTH_OK=false
for i in {1..10}; do
  if curl -sf http://localhost:2000 > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 2
done

echo ""
echo "========================================"
if [[ "$HEALTH_OK" == true ]]; then
  echo -e "  ${GREEN}VPS Setup Complete!${NC}"
else
  echo -e "  ${YELLOW}Setup Complete (app may still be starting)${NC}"
fi
echo "========================================"
echo ""
echo "  App:        http://localhost:2000"
echo "  Install:    ${INSTALL_DIR}"
echo "  Service:    systemctl status tandem"
echo "  Logs:       journalctl -u tandem -f"
echo ""
echo -e "  ${YELLOW}SAVE THESE CREDENTIALS OFF-SERVER:${NC}"
echo "  ─────────────────────────────────────────"
echo "  DB password:        ${DB_PASSWORD}"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
echo "  Backup passphrase:  ${BACKUP_PASSPHRASE}"
fi
echo "  ─────────────────────────────────────────"
if [[ "$SEED" == true ]]; then
echo ""
echo -e "  ${BLUE}DEMO ACCOUNTS (seeded):${NC}"
echo "  ─────────────────────────────────────────"
echo "  Admin login:  admin@tandem.local / admin123"
echo "  Demo login:   demo@tandem.local / demo123"
echo "  ─────────────────────────────────────────"
fi
echo ""
echo "  Next steps:"
echo "    1. Open http://localhost:2000 and create your account"
echo "    2. Run scripts/setup-cloudflare-tunnel.sh to expose via your domain"
echo "    3. Set up backup cron jobs (see docs/BACKUP_GUIDE.md)"
echo ""
