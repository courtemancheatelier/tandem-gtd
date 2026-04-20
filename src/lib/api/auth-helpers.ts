import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveBearer, type BearerAuthResult } from "@/lib/api/resolve-bearer";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/api/rate-limit";

// ---------------------------------------------------------------------------
// AuthContext — richer auth info for routes that need scope checking
// ---------------------------------------------------------------------------

export interface AuthContext {
  userId: string;
  scopes: string[];
  isBearerAuth: boolean;
  /** First 8 chars of the raw token — used as rate-limit key. Only set for Bearer auth. */
  tokenPrefix?: string;
  hasScope(scope: string): boolean;
}

// ---------------------------------------------------------------------------
// getCurrentUserId — legacy helper, kept for session-only routes
// ---------------------------------------------------------------------------

/**
 * Session-only auth helper. Returns the userId from a session cookie, or null.
 * Bearer tokens are intentionally rejected — routes that need token access
 * should use `requireAuth(method)` which enforces scopes and rate limiting.
 *
 * @deprecated Prefer `requireAuth(method)` for any route that should be
 * accessible via API tokens.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session.user.id;
  return null;
}

// ---------------------------------------------------------------------------
// getAuthContext — returns richer auth info (scopes, bearer vs session)
// ---------------------------------------------------------------------------

export async function getAuthContext(): Promise<AuthContext | null> {
  // 1. Try session cookie
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const scopes = ["read", "write"];
    return {
      userId: session.user.id,
      scopes,
      isBearerAuth: false,
      hasScope: (scope: string) => scopes.includes(scope),
    };
  }

  // 2. Try Bearer token
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawToken = authHeader.slice(7);
  const result: BearerAuthResult | null = await resolveBearer(rawToken);
  if (!result) return null;

  // Check apiAccessEnabled
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { apiAccessEnabled: true },
  });
  if (!settings?.apiAccessEnabled) return null;

  const scopes = result.scopes;
  return {
    userId: result.userId,
    scopes,
    isBearerAuth: true,
    tokenPrefix: result.tokenPrefix,
    hasScope: (scope: string) => scopes.includes(scope),
  };
}

// ---------------------------------------------------------------------------
// requireAuth — getAuthContext + scope enforcement + rate limiting
// ---------------------------------------------------------------------------

const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * Authenticate the request and, for Bearer tokens, enforce scope + rate limit.
 *
 * - Session-cookie users pass through with no rate limit or scope check.
 * - Bearer tokens are rate-limited to 120 req/min per token prefix and must
 *   have the appropriate scope ("read" for GET/HEAD, "write" for mutations).
 *
 * Returns an `AuthContext` on success, or a `NextResponse` (401/403/429) on failure.
 */
export async function requireAuth(
  method: string
): Promise<AuthContext | NextResponse> {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  // Session-cookie users: no rate limit, no scope check (always read+write)
  if (!auth.isBearerAuth) return auth;

  // ── Bearer: rate limit (120 req / 60 s per token) ──────────────────────
  const rateLimited = checkRateLimit(
    `bearer:${auth.tokenPrefix}`,
    120,
    60_000
  );
  if (rateLimited) return rateLimited;

  // ── Bearer: scope enforcement ──────────────────────────────────────────
  const requiredScope = READ_METHODS.has(method.toUpperCase())
    ? "read"
    : "write";
  if (!auth.hasScope(requiredScope)) {
    return forbidden(`Token requires '${requiredScope}' scope`);
  }

  return auth;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

// ---------------------------------------------------------------------------
// verifyCronSecret — timing-safe comparison for cron endpoint auth (Finding 5.1)
// ---------------------------------------------------------------------------

import { timingSafeEqual } from "crypto";

/**
 * Verifies the Authorization header matches the CRON_SECRET using
 * timing-safe comparison to prevent timing side-channel attacks.
 * Returns true if the secret is valid, false otherwise.
 */
export function verifyCronSecret(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) return false;

  const expected = `Bearer ${cronSecret}`;
  if (authHeader.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(authHeader),
    Buffer.from(expected)
  );
}
