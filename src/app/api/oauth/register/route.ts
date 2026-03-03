/**
 * OAuth 2.1 Dynamic Client Registration — RFC 7591
 *
 * POST /api/oauth/register
 * MCP clients call this to register themselves before starting the OAuth flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  generateClientId,
  generateClientSecret,
  isValidRedirectUri,
} from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Rate limit: 10 registrations per IP per hour
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimited = checkRateLimit(`oauth-register:${ip}`, 10, 60 * 60 * 1000);
  if (rateLimited) return rateLimited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate redirect_uris
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "redirect_uris is required and must be a non-empty array",
      },
      { status: 400 }
    );
  }

  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !isValidRedirectUri(uri)) {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: `Invalid redirect URI: ${uri}. HTTPS required (except localhost).`,
        },
        { status: 400 }
      );
    }
  }

  // Determine auth method
  const tokenEndpointAuthMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "client_secret_post";

  const isPublicClient = tokenEndpointAuthMethod === "none";

  // Generate credentials
  const clientId = generateClientId();
  let clientSecretRaw: string | undefined;
  let clientSecretHash: string | undefined;

  if (!isPublicClient) {
    const secret = await generateClientSecret();
    clientSecretRaw = secret.raw;
    clientSecretHash = secret.hash;
  }

  const clientName =
    typeof body.client_name === "string" ? body.client_name : "Unknown Client";

  // Store in DB
  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecret: clientSecretHash || null,
      clientName,
      redirectUris: redirectUris as string[],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod,
    },
  });

  // Response per RFC 7591
  const response: Record<string, unknown> = {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: tokenEndpointAuthMethod,
  };

  if (clientSecretRaw) {
    response.client_secret = clientSecretRaw;
  }

  return NextResponse.json(response, { status: 201 });
}
