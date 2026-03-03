#!/bin/sh
set -e

# =============================================================================
# Tandem GTD — Container entrypoint
# Waits for PostgreSQL, runs migrations, seeds data, starts the server.
# =============================================================================

echo "Tandem GTD — starting up..."

# ---------------------------------------------------------------------------
# Wait for the database to accept connections
# ---------------------------------------------------------------------------
echo "Waiting for database to be ready..."

MAX_RETRIES=30
RETRY_INTERVAL=2
RETRIES=0

until echo "SELECT 1" | npx prisma db execute --stdin > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: Database not reachable after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  Database not ready yet (attempt ${RETRIES}/${MAX_RETRIES}). Retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done

echo "Database is ready."

# ---------------------------------------------------------------------------
# Run Prisma migrations
# ---------------------------------------------------------------------------
echo "Running database migrations..."
npx prisma migrate deploy
echo "Migrations complete."

# ---------------------------------------------------------------------------
# Create default admin user if no users exist (first run only)
# ---------------------------------------------------------------------------
USER_COUNT=$(echo "SELECT COUNT(*) FROM \"User\"" | npx prisma db execute --stdin 2>/dev/null | grep -o '[0-9]*' | tail -1)
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "No users found — creating default admin account..."
  # Password: admin123 (bcrypt hash)
  printf '%s\n' \
    "INSERT INTO \"User\" (id, name, email, password, \"isAdmin\", tier, \"updatedAt\", \"onboardingCompletedAt\") VALUES ('default-admin', 'Admin', 'admin@tandem.local', '\$2b\$10\$BoajoRwWMCvJg5QMV6wtkOg530.W6WGdnFgV6ugFduZsN2mRyhpC6', true, 'GENERAL', NOW(), NOW());" \
    "INSERT INTO \"ServerSettings\" (id, \"updatedAt\", \"registrationMode\") VALUES ('singleton', NOW(), 'OPEN') ON CONFLICT (id) DO NOTHING;" \
    | npx prisma db execute --stdin 2>&1 || echo "Warning: default admin creation failed (non-fatal)"
  echo ""
  echo "  ┌─────────────────────────────────────────────┐"
  echo "  │  Default admin account created:              │"
  echo "  │    Email:    admin@tandem.local               │"
  echo "  │    Password: admin123                         │"
  echo "  │                                               │"
  echo "  │  ⚠ Change the password after first login!    │"
  echo "  └─────────────────────────────────────────────┘"
  echo ""
fi

# ---------------------------------------------------------------------------
# Seed help articles (idempotent — skips unchanged articles)
# ---------------------------------------------------------------------------
if [ -f prisma/seed-help.ts ] && [ -d docs/help ]; then
  echo "Seeding help articles..."
  npx tsx prisma/seed-help.ts 2>&1 || echo "Warning: help article seeding failed (non-fatal)"
fi

# ---------------------------------------------------------------------------
# Start the Next.js standalone server
# ---------------------------------------------------------------------------
echo "Starting Tandem GTD server on port ${PORT:-3000}..."
exec node server.js
