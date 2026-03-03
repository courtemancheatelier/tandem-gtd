import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { validateOrigin } from "@/lib/api/csrf";

// NextAuth middleware for page routes (login redirect)
const authMiddleware = withAuth({
  pages: {
    signIn: "/login",
  },
});

// ---------------------------------------------------------------------------
// CORS headers for Bearer-authenticated REST requests
// ---------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Paths that expired trial users can still access
const TRIAL_WHITELIST = [
  "/trial-ended",
  "/api/export",
  "/api/trial",
  "/api/auth",
  "/login",
];

export default async function middleware(req: NextRequest) {
  // API routes: CSRF origin check on mutating methods + CORS for Bearer
  if (req.nextUrl.pathname.startsWith("/api/")) {
    // Skip CORS for MCP — it has its own whitelist-based CORS
    const isMcp = req.nextUrl.pathname.startsWith("/api/mcp");
    // Public API routes — no auth, no CSRF
    const isPublicApi = req.nextUrl.pathname.startsWith("/api/public");

    // ── CORS preflight for Bearer clients ──────────────────────────────
    if (
      !isMcp &&
      req.method === "OPTIONS" &&
      req.headers
        .get("access-control-request-headers")
        ?.toLowerCase()
        .includes("authorization")
    ) {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    if (isPublicApi) {
      return NextResponse.next();
    }

    if (!validateOrigin(req)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Auth is handled by requireAuth() / getCurrentUserId() in each route
    const response = NextResponse.next();

    // ── Attach CORS headers when the request carries a Bearer token ────
    if (!isMcp && req.headers.get("authorization")?.startsWith("Bearer ")) {
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        response.headers.set(key, value);
      }
    }

    return response;
  }

  // Public landing page
  if (req.nextUrl.pathname === "/") {
    const hasSession =
      req.cookies.has("next-auth.session-token") ||
      req.cookies.has("__Secure-next-auth.session-token");
    if (hasSession) {
      return NextResponse.redirect(new URL("/do-now", req.url));
    }
    return NextResponse.next();
  }

  // ── Trial expiration redirect ──────────────────────────────────────────
  const isWhitelisted = TRIAL_WHITELIST.some((p) =>
    req.nextUrl.pathname.startsWith(p)
  );

  if (!isWhitelisted) {
    const token = await getToken({ req });
    if (
      token?.isTrial &&
      token.trialExpiresAt &&
      new Date(token.trialExpiresAt) < new Date()
    ) {
      return NextResponse.redirect(new URL("/trial-ended", req.url));
    }
  }

  // Page routes: NextAuth authentication (redirect to login)
  return (authMiddleware as unknown as (req: NextRequest) => Promise<NextResponse>)(req);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|trial-ended|terms|privacy|api-docs|openapi\\.json|manifest\\.json|sw\\.js|offline\\.html|icons/|\\.well-known/).*)",
  ],
};
