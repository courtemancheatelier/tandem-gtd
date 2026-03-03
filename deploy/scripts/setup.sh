#!/usr/bin/env bash
# =============================================================================
# Tandem GTD — First-Time Setup Script
# =============================================================================
# Generates secrets, creates .env from .env.example, and starts the stack.
#
# Usage:
#   ./scripts/setup.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.example"

echo "============================================="
echo " Tandem GTD — First-Time Setup"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------
for cmd in docker openssl; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "ERROR: '$cmd' is required but not found. Please install it first."
    exit 1
  fi
done

if ! docker compose version &> /dev/null; then
  echo "ERROR: 'docker compose' is required. Please install Docker Compose v2."
  exit 1
fi

# ---------------------------------------------------------------------------
# Generate .env if it doesn't exist
# ---------------------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  echo "Found existing .env file."
  read -r -p "Overwrite with fresh secrets? [y/N] " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo "Keeping existing .env file."
    echo ""
  else
    rm -f "$ENV_FILE"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "ERROR: .env.example not found at $ENV_EXAMPLE"
    exit 1
  fi

  echo "Generating secrets..."

  # Generate cryptographically secure values
  NEXTAUTH_SECRET="$(openssl rand -base64 48)"
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
  POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"

  # Copy example and substitute placeholders
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Use platform-safe sed (macOS + Linux)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    SED_INPLACE=(-i '')
  else
    SED_INPLACE=(-i)
  fi

  sed "${SED_INPLACE[@]}" "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed "${SED_INPLACE[@]}" "s|DATABASE_URL=.*|DATABASE_URL=postgresql://tandem:${POSTGRES_PASSWORD}@db:5432/tandem|" "$ENV_FILE"
  sed "${SED_INPLACE[@]}" "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${NEXTAUTH_SECRET}|" "$ENV_FILE"
  sed "${SED_INPLACE[@]}" "s|TANDEM_ENCRYPTION_KEY=.*|TANDEM_ENCRYPTION_KEY=${ENCRYPTION_KEY}|" "$ENV_FILE"

  echo "  .env created with generated secrets."
  echo ""
fi

# ---------------------------------------------------------------------------
# Prompt for domain
# ---------------------------------------------------------------------------
CURRENT_URL=$(grep "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d= -f2-)

if [[ "$CURRENT_URL" == *"your-domain.com"* ]]; then
  read -r -p "Enter your domain name (e.g., gtd.example.com): " DOMAIN
  if [ -n "$DOMAIN" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      SED_INPLACE=(-i '')
    else
      SED_INPLACE=(-i)
    fi
    sed "${SED_INPLACE[@]}" "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|" "$ENV_FILE"

    # Also update the Caddyfile
    CADDYFILE="$DEPLOY_DIR/Caddyfile"
    if [ -f "$CADDYFILE" ]; then
      sed "${SED_INPLACE[@]}" "s|your-domain.com|${DOMAIN}|" "$CADDYFILE"
      echo "  Updated Caddyfile with domain: $DOMAIN"
    fi
    echo "  Updated NEXTAUTH_URL to: https://$DOMAIN"
  fi
  echo ""
fi

# ---------------------------------------------------------------------------
# Build and start
# ---------------------------------------------------------------------------
echo "Building and starting Tandem GTD..."
echo ""

cd "$DEPLOY_DIR"
docker compose build
docker compose up -d

echo ""
echo "============================================="
echo " Setup complete!"
echo "============================================="
echo ""
echo "  Tandem GTD is starting up. It may take a minute"
echo "  for the database migrations to complete."
echo ""
echo "  Check status:  docker compose -f $DEPLOY_DIR/docker-compose.yml ps"
echo "  View logs:     docker compose -f $DEPLOY_DIR/docker-compose.yml logs -f app"
echo ""
echo "  Backups:       $DEPLOY_DIR/scripts/backup.sh"
echo "  Restore:       $DEPLOY_DIR/scripts/restore.sh <backup-file>"
echo ""
