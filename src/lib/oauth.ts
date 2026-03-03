/**
 * OAuth 2.1 Authorization Server — Core Utilities
 *
 * Token generation, PKCE validation, token verification, and cleanup.
 * Follows the same bcrypt + prefix lookup pattern as ApiToken.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const BCRYPT_ROUNDS = 10;
const TOKEN_BYTES = 48;
const PREFIX_LENGTH = 8;

// ---------------------------------------------------------------------------
// Token Generation
// ---------------------------------------------------------------------------

export interface GeneratedToken {
  raw: string;
  prefix: string;
  hash: string;
}

/**
 * Generate a cryptographically random token with prefix and bcrypt hash.
 * Same pattern as ApiToken: 8-char prefix for lookup, bcrypt hash for storage.
 */
export async function generateToken(): Promise<GeneratedToken> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const prefix = raw.slice(0, PREFIX_LENGTH);
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
  return { raw, prefix, hash };
}

/**
 * Generate a UUID client ID.
 */
export function generateClientId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a client secret with bcrypt hash.
 */
export async function generateClientSecret(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
  return { raw, hash };
}

/**
 * Generate an authorization code with prefix and bcrypt hash.
 * Same pattern as access/refresh tokens for consistent security.
 */
export async function generateAuthorizationCode(): Promise<GeneratedToken> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const prefix = raw.slice(0, PREFIX_LENGTH);
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
  return { raw, prefix, hash };
}

// ---------------------------------------------------------------------------
// PKCE S256 Validation
// ---------------------------------------------------------------------------

/**
 * Validate PKCE S256: SHA-256(code_verifier) base64url-encoded must equal code_challenge.
 */
export function validatePkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const computed = hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(codeChallenge)
    );
  } catch {
    // Lengths differ — not a match
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token Verification
// ---------------------------------------------------------------------------

export interface VerifiedOAuthToken {
  userId: string;
  clientId: string;
  scope: string;
  expiresAt: Date;
}

/**
 * Verify an OAuth access token: prefix lookup + bcrypt compare.
 * Returns token info or null if invalid/expired.
 */
export async function verifyOAuthAccessToken(
  rawToken: string
): Promise<VerifiedOAuthToken | null> {
  if (!rawToken || rawToken.length < PREFIX_LENGTH) return null;

  const prefix = rawToken.slice(0, PREFIX_LENGTH);

  const tokens = await prisma.oAuthAccessToken.findMany({
    where: { prefix },
    include: { client: { select: { clientId: true } } },
  });

  for (const token of tokens) {
    if (token.expiresAt < new Date()) continue;

    const valid = await bcrypt.compare(rawToken, token.token);
    if (valid) {
      return {
        userId: token.userId,
        clientId: token.client.clientId,
        scope: token.scope,
        expiresAt: token.expiresAt,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// AuthInfo Builder
// ---------------------------------------------------------------------------

/**
 * Build an MCP SDK AuthInfo object from a verified OAuth token.
 */
export function buildAuthInfo(
  rawToken: string,
  verified: VerifiedOAuthToken
): AuthInfo {
  return {
    token: rawToken,
    clientId: verified.clientId,
    scopes: verified.scope ? verified.scope.split(" ") : [],
    expiresAt: Math.floor(verified.expiresAt.getTime() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Redirect URI Validation
// ---------------------------------------------------------------------------

/**
 * Validate a redirect URI against registered URIs (exact string match per spec).
 */
export function validateRedirectUri(
  uri: string,
  registeredUris: string[]
): boolean {
  return registeredUris.includes(uri);
}

/**
 * Validate a redirect URI format: HTTPS required, except localhost for dev.
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    // Allow http for localhost (development)
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    // Require HTTPS for all other hosts
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Purge expired authorization codes, access tokens, and revoked refresh tokens.
 */
export async function cleanupExpiredOAuthData(): Promise<void> {
  const now = new Date();

  await Promise.all([
    prisma.oAuthAuthorizationCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { used: true }],
      },
    }),
    prisma.oAuthAccessToken.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.oAuthRefreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { revoked: true }],
      },
    }),
  ]);
}
