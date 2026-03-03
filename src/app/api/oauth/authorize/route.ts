/**
 * OAuth 2.1 Authorization Code Generation
 *
 * POST /api/oauth/authorize
 * Form submission target from the consent page. Generates an authorization code
 * and redirects to the client's redirect_uri.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  generateAuthorizationCode,
  validateRedirectUri,
} from "@/lib/oauth";

export async function POST(request: NextRequest) {
  // Verify the user is logged in via NextAuth
  let userId: string | null = null;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json(
      { error: "server_error", error_description: "Failed to verify session" },
      { status: 500 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized", error_description: "Not logged in" },
      { status: 401 }
    );
  }

  // Parse body — support both form-urlencoded (fetch) and multipart/form-data (native form)
  const contentType = request.headers.get("content-type") || "";
  let clientId: string | null = null;
  let redirectUri: string | null = null;
  let responseType: string | null = null;
  let codeChallenge: string | null = null;
  let codeChallengeMethod: string | null = null;
  let scope: string = "mcp:full";
  let state: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    clientId = params.get("client_id");
    redirectUri = params.get("redirect_uri");
    responseType = params.get("response_type");
    codeChallenge = params.get("code_challenge");
    codeChallengeMethod = params.get("code_challenge_method");
    scope = params.get("scope") || "mcp:full";
    state = params.get("state");
  } else {
    const formData = await request.formData();
    clientId = formData.get("client_id") as string | null;
    redirectUri = formData.get("redirect_uri") as string | null;
    responseType = formData.get("response_type") as string | null;
    codeChallenge = formData.get("code_challenge") as string | null;
    codeChallengeMethod = formData.get("code_challenge_method") as string | null;
    scope = (formData.get("scope") as string | null) || "mcp:full";
    state = formData.get("state") as string | null;
  }

  // Validate required params
  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing required parameters" },
      { status: 400 }
    );
  }

  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type", error_description: "Only 'code' is supported" },
      { status: 400 }
    );
  }

  if (codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "code_challenge_method must be S256" },
      { status: 400 }
    );
  }

  // Look up the client
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 }
    );
  }

  // Validate redirect_uri (exact match)
  if (!validateRedirectUri(redirectUri, client.redirectUris)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri does not match registered URIs" },
      { status: 400 }
    );
  }

  // Generate authorization code (hashed — single-use, 10-min expiry)
  const authCode = await generateAuthorizationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.oAuthAuthorizationCode.create({
    data: {
      code: authCode.hash,
      prefix: authCode.prefix,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod: "S256",
      state,
      expiresAt,
      clientId: client.id,
      userId,
    },
  });

  // Build redirect URL with raw code + state
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", authCode.raw);
  if (state) {
    redirect.searchParams.set("state", state);
  }

  const redirectUrl = redirect.toString();

  // If the caller wants JSON (consent page fetch), return the URL.
  // Otherwise return a standard OAuth 302 redirect (native form / direct call).
  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ redirect_url: redirectUrl });
  }

  return NextResponse.redirect(redirectUrl, 302);
}
