/**
 * Prisma Client & User Context for the MCP Server
 *
 * Supports two modes:
 *
 * 1. **Standalone (stdio transport):** Runs as a separate process outside Next.js.
 *    Uses its own PrismaClient and reads TANDEM_USER_ID from env vars.
 *
 * 2. **HTTP transport (inside Next.js):** Runs as an API route. Uses the app's
 *    shared PrismaClient and per-request userId from bearer token auth.
 *    Context is set via AsyncLocalStorage so tool handlers work unchanged.
 */

import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { getConfig } from "./config";

// Per-request context for HTTP transport
const asyncStore = new AsyncLocalStorage<{ userId: string; prisma: PrismaClient }>();

// Standalone mode singletons (stdio transport)
let _prisma: PrismaClient | null = null;
let _userId: string | null = null;

/**
 * Get the Prisma client instance.
 * In HTTP mode: returns the app's shared PrismaClient from AsyncLocalStorage.
 * In stdio mode: returns a standalone PrismaClient (lazily initialized).
 */
export function getPrisma(): PrismaClient {
  const store = asyncStore.getStore();
  if (store) return store.prisma;

  if (!_prisma) {
    const config = getConfig();
    _prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });
  }
  return _prisma;
}

/**
 * Get the user ID for MCP operations.
 * In HTTP mode: returns the userId from the authenticated bearer token.
 * In stdio mode: returns TANDEM_USER_ID from env vars.
 */
export function getUserId(): string {
  const store = asyncStore.getStore();
  if (store) return store.userId;

  if (!_userId) {
    const config = getConfig();
    _userId = config.userId;
  }
  return _userId;
}

/**
 * Run a function with per-request MCP context.
 * Used by the HTTP transport route to set userId and Prisma client per-session.
 * AsyncLocalStorage propagates through the entire async chain, so all calls
 * to getPrisma() and getUserId() within the function use the provided values.
 */
export function runWithContext<T>(
  userId: string,
  prisma: PrismaClient,
  fn: () => T
): T {
  return asyncStore.run({ userId, prisma }, fn);
}

/**
 * Gracefully disconnect the standalone Prisma client.
 * Called during stdio server shutdown. No-op for HTTP mode.
 */
export async function disconnect(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
