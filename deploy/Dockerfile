# =============================================================================
# Tandem GTD — Multi-stage Docker build
# =============================================================================
# Stage 1: Install dependencies
# Stage 2: Build the Next.js application (standalone output)
# Stage 3: Minimal production runner
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — deps: install production + dev dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2 — builder: generate Prisma client & build Next.js
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client
RUN npx prisma generate

# Build Next.js in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runner: production image with minimal footprint
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone server
COPY --from=builder /app/.next/standalone ./

# Copy static assets and public files
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma schema + migrations (needed for runtime migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy the generated Prisma client from node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy help docs and seed script (for seeding help articles on first run)
COPY --from=builder /app/docs/help ./docs/help
COPY --from=builder /app/prisma/seed-help.ts ./prisma/seed-help.ts

# Copy the entrypoint script
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/entrypoint.sh"]
