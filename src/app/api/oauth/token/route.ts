/**
 * OAuth 2.1 Token Endpoint
 *
 * POST /api/oauth/token
 * Handles authorization_code exchange and refresh_token rotation.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  generateToken,
  validatePkceS256,
  cleanupExpiredOAuthData,
} from "@/lib/oauth";

function tokenError(
  error: string,
  description: string,
  status = 400
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  // Rate limit: 20 requests per IP per minute
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimited = checkRateLimit(`oauth-token:${ip}`, 20, 60 * 1000);
  if (rateLimited) return rateLimited;

  // Parse form-urlencoded body (per OAuth spec)
  let params: URLSearchParams;
  try {
    const body = await request.text();
    params = new URLSearchParams(body);
  } catch {
    return tokenError("invalid_request", "Invalid request body");
  }

  // Probabilistic cleanup: ~10% of requests purge expired OAuth data
  if (Math.random() < 0.1) {
    cleanupExpiredOAuthData().catch(() => {});
  }

  const grantType = params.get("grant_type");

  // RFC 8707: resource indicator — echo back in token response
  const resource = params.get("resource") || undefined;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(params, resource);
  } else if (grantType === "refresh_token") {
    return handleRefreshToken(params, resource);
  }

  return tokenError(
    "unsupported_grant_type",
    "Supported grant types: authorization_code, refresh_token"
  );
}

// ---------------------------------------------------------------------------
// Authorization Code Exchange
// ---------------------------------------------------------------------------

async function handleAuthorizationCode(
  params: URLSearchParams,
  resource?: string
): Promise<NextResponse> {
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeVerifier = params.get("code_verifier");

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return tokenError(
      "invalid_request",
      "Missing required parameters: code, redirect_uri, client_id, code_verifier"
    );
  }

  if (code.length < 8) {
    return tokenError("invalid_grant", "Invalid authorization code");
  }

  // Prefix lookup + bcrypt compare (same pattern as access/refresh tokens)
  const prefix = code.slice(0, 8);
  const candidates = await prisma.oAuthAuthorizationCode.findMany({
    where: { prefix },
    include: { client: true },
  });

  let authCode: (typeof candidates)[0] | null = null;
  for (const candidate of candidates) {
    if (candidate.used || candidate.expiresAt < new Date()) continue;
    const valid = await bcrypt.compare(code, candidate.code);
    if (valid) {
      authCode = candidate;
      break;
    }
  }

  if (!authCode) {
    return tokenError("invalid_grant", "Invalid authorization code");
  }

  // Validate: client matches
  if (authCode.client.clientId !== clientId) {
    return tokenError("invalid_grant", "Client ID does not match");
  }

  // Validate: redirect_uri matches
  if (authCode.redirectUri !== redirectUri) {
    return tokenError("invalid_grant", "Redirect URI does not match");
  }

  // Mark as used immediately (before PKCE check to prevent replay)
  await prisma.oAuthAuthorizationCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });

  // Validate PKCE S256
  if (!validatePkceS256(codeVerifier, authCode.codeChallenge)) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  // Optionally validate client_secret for confidential clients
  const clientSecret = params.get("client_secret");
  if (authCode.client.clientSecret) {
    if (!clientSecret) {
      return tokenError("invalid_client", "Client secret required");
    }
    const secretValid = await bcrypt.compare(
      clientSecret,
      authCode.client.clientSecret
    );
    if (!secretValid) {
      return tokenError("invalid_client", "Invalid client secret");
    }
  }

  // Generate access token (1-hour expiry)
  const accessToken = await generateToken();
  const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

  // Generate refresh token (30-day expiry)
  const refreshToken = await generateToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Store both tokens
  await Promise.all([
    prisma.oAuthAccessToken.create({
      data: {
        token: accessToken.hash,
        prefix: accessToken.prefix,
        scope: authCode.scope,
        expiresAt: accessExpiresAt,
        clientId: authCode.client.id,
        userId: authCode.userId,
      },
    }),
    prisma.oAuthRefreshToken.create({
      data: {
        token: refreshToken.hash,
        prefix: refreshToken.prefix,
        scope: authCode.scope,
        expiresAt: refreshExpiresAt,
        clientId: authCode.client.id,
        userId: authCode.userId,
      },
    }),
  ]);

  const tokenResponse: Record<string, unknown> = {
    access_token: accessToken.raw,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken.raw,
    scope: authCode.scope,
  };

  // RFC 8707: echo back the resource indicator
  if (resource) {
    tokenResponse.resource = resource;
  }

  return NextResponse.json(tokenResponse, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

// ---------------------------------------------------------------------------
// Refresh Token Rotation
// ---------------------------------------------------------------------------

async function handleRefreshToken(
  params: URLSearchParams,
  resource?: string
): Promise<NextResponse> {
  const rawRefreshToken = params.get("refresh_token");
  const clientId = params.get("client_id");

  if (!rawRefreshToken || !clientId) {
    return tokenError(
      "invalid_request",
      "Missing required parameters: refresh_token, client_id"
    );
  }

  if (rawRefreshToken.length < 8) {
    return tokenError("invalid_grant", "Invalid refresh token");
  }

  // Prefix lookup + bcrypt compare
  const prefix = rawRefreshToken.slice(0, 8);
  const candidates = await prisma.oAuthRefreshToken.findMany({
    where: { prefix },
    include: { client: true },
  });

  let matchedToken: (typeof candidates)[0] | null = null;
  for (const candidate of candidates) {
    if (candidate.revoked || candidate.expiresAt < new Date()) continue;
    if (candidate.client.clientId !== clientId) continue;

    const valid = await bcrypt.compare(rawRefreshToken, candidate.token);
    if (valid) {
      matchedToken = candidate;
      break;
    }
  }

  if (!matchedToken) {
    return tokenError("invalid_grant", "Invalid or expired refresh token");
  }

  // Optionally validate client_secret for confidential clients
  const clientSecret = params.get("client_secret");
  if (matchedToken.client.clientSecret) {
    if (!clientSecret) {
      return tokenError("invalid_client", "Client secret required");
    }
    const secretValid = await bcrypt.compare(
      clientSecret,
      matchedToken.client.clientSecret
    );
    if (!secretValid) {
      return tokenError("invalid_client", "Invalid client secret");
    }
  }

  // Revoke old refresh token (rotation)
  await prisma.oAuthRefreshToken.update({
    where: { id: matchedToken.id },
    data: { revoked: true },
  });

  // Generate new pair
  const newAccessToken = await generateToken();
  const accessExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const newRefreshToken = await generateToken();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.oAuthAccessToken.create({
      data: {
        token: newAccessToken.hash,
        prefix: newAccessToken.prefix,
        scope: matchedToken.scope,
        expiresAt: accessExpiresAt,
        clientId: matchedToken.client.id,
        userId: matchedToken.userId,
      },
    }),
    prisma.oAuthRefreshToken.create({
      data: {
        token: newRefreshToken.hash,
        prefix: newRefreshToken.prefix,
        scope: matchedToken.scope,
        expiresAt: refreshExpiresAt,
        clientId: matchedToken.client.id,
        userId: matchedToken.userId,
      },
    }),
  ]);

  const refreshResponse: Record<string, unknown> = {
    access_token: newAccessToken.raw,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: newRefreshToken.raw,
    scope: matchedToken.scope,
  };

  if (resource) {
    refreshResponse.resource = resource;
  }

  return NextResponse.json(refreshResponse, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  }
  );
}
