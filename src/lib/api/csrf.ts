import { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Validates that a mutating request originates from the same origin.
 * Returns true if the request is safe, false if it should be blocked.
 *
 * Skips validation for:
 * - Safe HTTP methods (GET, HEAD, OPTIONS)
 * - NextAuth routes (they have their own CSRF protection)
 * - MCP endpoint (uses bearer token auth, accepts cross-origin requests)
 * - Development mode
 */
export function validateOrigin(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return true;
  if (req.nextUrl.pathname.startsWith("/api/auth/")) return true;
  if (req.nextUrl.pathname.startsWith("/api/mcp")) return true;
  // OAuth endpoints that receive cross-origin POSTs from MCP clients.
  // /api/oauth/authorize is intentionally NOT exempt — it's a same-origin
  // form POST from the consent page and needs CSRF protection.
  if (req.nextUrl.pathname.startsWith("/api/oauth/token")) return true;
  if (req.nextUrl.pathname.startsWith("/api/oauth/register")) return true;
  if (req.nextUrl.pathname.startsWith("/api/oauth/revoke")) return true;
  // Server-to-server webhooks authenticate via shared secret, not Origin.
  // Explicit allowlist — any new webhook route MUST be added here AND implement
  // its own shared-secret check (see email-inbound for the pattern with
  // crypto.timingSafeEqual). Do NOT broaden this to a prefix match; that would
  // silently exempt any future /api/webhooks/* route from CSRF protection.
  if (req.nextUrl.pathname === "/api/webhooks/email-inbound") return true;
  if (process.env.NODE_ENV === "development") return true;

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!host) return false;

  // Check Origin header first
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }

  // Fall back to Referer header
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      return refererHost === host;
    } catch {
      return false;
    }
  }

  // No Origin or Referer — block the request
  return false;
}
