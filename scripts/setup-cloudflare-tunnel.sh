#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Cloudflare Tunnel Setup
# =============================================================================
# Interactive script to set up a Cloudflare Tunnel for Tandem.
# Installs cloudflared, authenticates, creates a tunnel, configures DNS,
# and installs the tunnel as a systemd service.
#
# Prerequisites:
#   - Domain must already be on Cloudflare (nameservers transferred)
#   - Run as root (or with sudo)
#
# Usage:
#   sudo bash scripts/setup-cloudflare-tunnel.sh [OPTIONS]
#
# Options:
#   --name <name>      Tunnel name (default: tandem-beta)
#   --domain <host>    Domain name (default: beta.tandemgtd.com)
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
TUNNEL_NAME="tandem-beta"
DOMAIN="beta.tandemgtd.com"
INSTALL_DIR="/opt/tandem"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)   TUNNEL_NAME="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    *)        error "Unknown option: $1" ;;
  esac
done

echo ""
echo "========================================"
echo "  Tandem GTD — Cloudflare Tunnel Setup"
echo "========================================"
echo ""
echo "  Tunnel name: ${TUNNEL_NAME}"
echo "  Domain:      ${DOMAIN}"
echo ""

[[ $EUID -eq 0 ]] || error "This script must be run as root (sudo)."

# =============================================================================
# Step 1: Install cloudflared
# =============================================================================
if command -v cloudflared &>/dev/null; then
  ok "cloudflared already installed ($(cloudflared --version 2>&1 | head -1))"
else
  info "Installing cloudflared..."

  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
  chmod 644 /usr/share/keyrings/cloudflare-main.gpg

  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/cloudflared.list

  apt-get update -qq
  apt-get install -y -qq cloudflared > /dev/null
  ok "cloudflared installed"
fi

# =============================================================================
# Step 2: Authenticate with Cloudflare
# =============================================================================
if [[ -f /root/.cloudflared/cert.pem ]]; then
  ok "Already authenticated with Cloudflare"
else
  echo ""
  info "Authenticating with Cloudflare..."
  echo -e "${YELLOW}  A URL will appear below. Open it in your browser to authorize.${NC}"
  echo ""
  cloudflared tunnel login
  ok "Authenticated with Cloudflare"
fi

# =============================================================================
# Step 3: Create tunnel
# =============================================================================
# Check if tunnel already exists
EXISTING_TUNNEL=$(cloudflared tunnel list -o json 2>/dev/null | jq -r ".[] | select(.name==\"${TUNNEL_NAME}\") | .id" || true)

if [[ -n "$EXISTING_TUNNEL" ]]; then
  TUNNEL_ID="$EXISTING_TUNNEL"
  ok "Tunnel '${TUNNEL_NAME}' already exists (ID: ${TUNNEL_ID})"
else
  info "Creating tunnel '${TUNNEL_NAME}'..."
  cloudflared tunnel create "$TUNNEL_NAME"

  TUNNEL_ID=$(cloudflared tunnel list -o json | jq -r ".[] | select(.name==\"${TUNNEL_NAME}\") | .id")
  [[ -n "$TUNNEL_ID" ]] || error "Failed to get tunnel ID after creation"
  ok "Tunnel created (ID: ${TUNNEL_ID})"
fi

# =============================================================================
# Step 4: Generate config from template
# =============================================================================
CONFIG_DIR="/etc/cloudflared"
CONFIG_FILE="${CONFIG_DIR}/config.yml"
TEMPLATE="${INSTALL_DIR}/deploy/cloudflared-config.yml"

mkdir -p "$CONFIG_DIR"

if [[ -f "$TEMPLATE" ]]; then
  info "Generating tunnel config from template..."
  sed -e "s|TUNNEL_ID|${TUNNEL_ID}|g" \
      -e "s|TUNNEL_DOMAIN|${DOMAIN}|g" \
      "$TEMPLATE" > "$CONFIG_FILE"
else
  info "Generating tunnel config..."
  cat > "$CONFIG_FILE" << CFGEOF
tunnel: ${TUNNEL_ID}
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: ${DOMAIN}
    service: http://localhost:2000
    originRequest:
      keepAliveTimeout: 90s
      noTLSVerify: false

  - service: http_status:404
CFGEOF
fi

ok "Config written to ${CONFIG_FILE}"

# =============================================================================
# Step 5: Route DNS
# =============================================================================
info "Setting up DNS route: ${DOMAIN} → tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>/dev/null || warn "DNS route may already exist"
ok "DNS route configured"

# =============================================================================
# Step 6: Update NEXTAUTH_URL in .env
# =============================================================================
ENV_FILE="${INSTALL_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
  info "Updating NEXTAUTH_URL to https://${DOMAIN}..."
  sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|" "$ENV_FILE"
  ok "NEXTAUTH_URL updated"

  info "Restarting Tandem to pick up new URL..."
  systemctl restart tandem 2>/dev/null || warn "Could not restart tandem service"
fi

# =============================================================================
# Step 7: Install as systemd service
# =============================================================================
info "Installing cloudflared as systemd service..."
cloudflared service install 2>/dev/null || warn "Service may already be installed"
systemctl enable cloudflared 2>/dev/null || true
systemctl restart cloudflared
ok "cloudflared service installed and started"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================"
echo -e "  ${GREEN}Cloudflare Tunnel Setup Complete!${NC}"
echo "========================================"
echo ""
echo "  Tunnel:   ${TUNNEL_NAME} (${TUNNEL_ID})"
echo "  Domain:   https://${DOMAIN}"
echo "  Config:   ${CONFIG_FILE}"
echo "  Service:  systemctl status cloudflared"
echo "  Logs:     journalctl -u cloudflared -f"
echo ""
echo "  ─────────────────────────────────────────────────────────────"
echo -e "  ${YELLOW}CONFIGURE CLOUDFLARE ACCESS (required):${NC}"
echo "  ─────────────────────────────────────────────────────────────"
echo ""
echo "  1. Go to: https://one.dash.cloudflare.com → Access → Applications"
echo ""
echo "  2. Create an Application:"
echo "     - Type: Self-hosted"
echo "     - Application domain: ${DOMAIN}"
echo "     - Name: Tandem Beta"
echo ""
echo "  3. Add a POLICY to restrict access:"
echo "     - Policy name: Email Whitelist"
echo "     - Action: Allow"
echo "     - Include rule: Emails — add your email(s)"
echo ""
echo "  4. Add a BYPASS policy for MCP:"
echo "     - Policy name: MCP Bypass"
echo "     - Action: Bypass"
echo "     - Include rule: Path — starts with /api/mcp"
echo "     (MCP uses its own Bearer token auth)"
echo ""
echo "  ─────────────────────────────────────────────────────────────"
echo ""
