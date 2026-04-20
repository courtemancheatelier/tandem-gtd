/**
 * OAuth 2.1 Authorization Server Metadata — RFC 8414
 *
 * GET /.well-known/oauth-authorization-server
 * Returns metadata JSON so MCP clients (Claude.ai, ChatGPT) can discover endpoints.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const issuer = process.env.NEXTAUTH_URL || "http://localhost:2000";

  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "none",
    ],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:full"],
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
