/**
 * OAuth 2.1 Token Revocation — RFC 7009
 *
 * POST /api/oauth/revoke
 * Accepts a token and revokes it. Requires client authentication.
 * Always returns 200 per spec (even if token not found).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  let params: URLSearchParams;
  try {
    const body = await request.text();
    params = new URLSearchParams(body);
  } catch {
    // Per RFC 7009, always return 200
    return NextResponse.json({}, { status: 200 });
  }

  const rawToken = params.get("token");
  const tokenTypeHint = params.get("token_type_hint");
  const clientId = params.get("client_id");

  // Client authentication is required per RFC 7009
  if (!clientId) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "client_id is required" },
      { status: 401 }
    );
  }

  // Look up the client
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client" },
      { status: 401 }
    );
  }

  // For confidential clients, verify client_secret
  if (client.clientSecret) {
    const clientSecret = params.get("client_secret");
    if (!clientSecret) {
      return NextResponse.json(
        { error: "invalid_client", error_description: "client_secret is required" },
        { status: 401 }
      );
    }
    const secretValid = await bcrypt.compare(clientSecret, client.clientSecret);
    if (!secretValid) {
      return NextResponse.json(
        { error: "invalid_client", error_description: "Invalid client credentials" },
        { status: 401 }
      );
    }
  }

  if (!rawToken || rawToken.length < 8) {
    return NextResponse.json({}, { status: 200 });
  }

  const prefix = rawToken.slice(0, 8);

  // Try to revoke as the hinted type first, then the other type

  if (tokenTypeHint !== "refresh_token") {
    // Try as access token first
    const revoked = await tryRevokeAccessToken(rawToken, prefix, client.id);
    if (revoked) return NextResponse.json({}, { status: 200 });
  }

  if (tokenTypeHint !== "access_token") {
    // Try as refresh token
    const revoked = await tryRevokeRefreshToken(rawToken, prefix, client.id);
    if (revoked) return NextResponse.json({}, { status: 200 });
  }

  // If hint didn't match, try the other type
  if (tokenTypeHint === "refresh_token") {
    await tryRevokeAccessToken(rawToken, prefix, client.id);
  } else if (tokenTypeHint === "access_token") {
    await tryRevokeRefreshToken(rawToken, prefix, client.id);
  }

  // Always 200 per spec, even if token not found
  return NextResponse.json({}, { status: 200 });
}

async function tryRevokeAccessToken(
  rawToken: string,
  prefix: string,
  clientDbId: string
): Promise<boolean> {
  const tokens = await prisma.oAuthAccessToken.findMany({
    where: { prefix, clientId: clientDbId },
  });

  for (const token of tokens) {
    const valid = await bcrypt.compare(rawToken, token.token);
    if (valid) {
      await prisma.oAuthAccessToken.delete({ where: { id: token.id } });
      return true;
    }
  }
  return false;
}

async function tryRevokeRefreshToken(
  rawToken: string,
  prefix: string,
  clientDbId: string
): Promise<boolean> {
  const tokens = await prisma.oAuthRefreshToken.findMany({
    where: { prefix, clientId: clientDbId },
  });

  for (const token of tokens) {
    const valid = await bcrypt.compare(rawToken, token.token);
    if (valid) {
      await prisma.oAuthRefreshToken.update({
        where: { id: token.id },
        data: { revoked: true },
      });
      return true;
    }
  }
  return false;
}
