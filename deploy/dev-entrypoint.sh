#!/bin/sh
set -e

# =============================================================================
# Tandem GTD — Development container entrypoint
# Generates Prisma client, runs migrations, seeds data, starts dev server.
# =============================================================================

echo "Tandem GTD (dev) — starting up..."

# Generate Prisma client
npx prisma generate

# Wait for DB and run migrations
echo "Running database migrations..."
npx prisma migrate deploy
echo "Migrations complete."

# Seed default admin if no users exist (first run only)
USER_COUNT=$(echo "SELECT COUNT(*) FROM \"User\"" | npx prisma db execute --stdin 2>/dev/null | grep -o '[0-9]*' | tail -1)
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "No users found — creating default admin account..."
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

# Seed help articles
if [ -d docs/help ]; then
  echo "Seeding help articles..."
  npx tsx prisma/seed-help.ts 2>&1 || echo "Warning: help article seeding failed (non-fatal)"
fi

# Start dev server
echo "Starting dev server..."
exec npm run dev -- -H 0.0.0.0
