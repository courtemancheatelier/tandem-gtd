/**
 * Bearer Token Resolution — shared by MCP route and REST API auth.
 *
 * Resolution order:
 *   1. OAuth access token (verifyOAuthAccessToken)
 *   2. ApiToken (personal access token) — prefix lookup + bcrypt compare
 *
 * Returns null when the token doesn't match anything.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyOAuthAccessToken } from "@/lib/oauth";

export interface BearerAuthResult {
  userId: string;
  tokenType: "oauth" | "api_token";
  scopes: string[];
  /** First 8 characters of the raw token (for logging / display). */
  tokenPrefix: string;
  /** Database row id — only set for api_token type. */
  tokenId?: string;
}

/**
 * Resolve a raw Bearer token to a user identity + metadata.
 * Tries OAuth first, then personal API tokens.
 */
export async function resolveBearer(
  rawToken: string
): Promise<BearerAuthResult | null> {
  if (!rawToken || rawToken.length < 8) return null;

  const prefix = rawToken.slice(0, 8);

  // ── 1. OAuth access token ──────────────────────────────────────────────
  try {
    const oauthResult = await verifyOAuthAccessToken(rawToken);
    if (oauthResult) {
      const scopes = oauthResult.scope
        ? oauthResult.scope.split(" ").filter(Boolean)
        : [];
      return {
        userId: oauthResult.userId,
        tokenType: "oauth",
        scopes,
        tokenPrefix: prefix,
      };
    }
  } catch {
    // OAuth verification failed — fall through to API token
  }

  // ── 2. Personal API token (prefix lookup + bcrypt) ─────────────────────
  const candidates = await prisma.apiToken.findMany({
    where: { prefix, revokedAt: null },
  });

  for (const candidate of candidates) {
    // Skip expired tokens
    if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;

    const valid = await bcrypt.compare(rawToken, candidate.token);
    if (valid) {
      // Fire-and-forget lastUsed update
      prisma.apiToken
        .update({
          where: { id: candidate.id },
          data: { lastUsed: new Date() },
        })
        .catch(() => {});

      return {
        userId: candidate.userId,
        tokenType: "api_token",
        scopes: candidate.scopes,
        tokenPrefix: prefix,
        tokenId: candidate.id,
      };
    }
  }

  return null;
}
