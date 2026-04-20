/**
 * MCP HTTP Transport — Streamable HTTP endpoint
 *
 * Exposes the Tandem GTD MCP server over HTTP at /api/mcp.
 * Supports claude.ai, ChatGPT, and any MCP-compatible client.
 *
 * Transport: WebStandard Streamable HTTP (MCP spec 2025-11-25)
 * Auth: Bearer token — OAuth 2.1 access tokens or ApiToken (personal access tokens)
 * Sessions: Stateful, per-token, with automatic cleanup
 *
 * HTTP methods:
 *   POST    — Initialize session or send JSON-RPC messages
 *   GET     — Establish SSE stream for server-to-client notifications
 *   DELETE  — Terminate a session
 *   OPTIONS — CORS preflight
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerTools } from "@/mcp/tools";
import { registerResources } from "@/mcp/resources";
import { runWithContext } from "@/mcp/prisma-client";
import { prisma } from "@/lib/prisma";
import { resolveBearer } from "@/lib/api/resolve-bearer";
import {
  verifyOAuthAccessToken,
  buildAuthInfo,
  cleanupExpiredOAuthData,
} from "@/lib/oauth";

const SERVER_NAME = "tandem-gtd";
const SERVER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: Server;
  userId: string;
  lastAccess: number;
}

const sessions = new Map<string, McpSession>();

// Clean up stale sessions every 5 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    sessions.forEach((session, id) => {
      if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
        session.transport.close().catch(() => {});
        sessions.delete(id);
      }
    });
    // Clean up expired OAuth tokens/codes
    cleanupExpiredOAuthData().catch(() => {});
  }, 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function getAllowedOrigins(): string[] {
  const origins = process.env.MCP_ALLOWED_ORIGINS;
  if (!origins) return [];
  return origins.split(",").map((o) => o.trim()).filter(Boolean);
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = getAllowedOrigins();

  // In development, allow all origins. In production, check whitelist.
  const allowOrigin =
    process.env.NODE_ENV === "development"
      ? origin || "*"
      : allowed.includes(origin)
        ? origin
        : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Mcp-Session-Id, mcp-session-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, mcp-session-id",
    "Access-Control-Max-Age": "86400",
  };
}

function addCorsHeaders(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Bearer Token Authentication (delegates to shared resolve-bearer)
// ---------------------------------------------------------------------------

interface AuthResult {
  userId: string;
  authInfo?: AuthInfo;
}

async function authenticateRequest(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawToken = authHeader.slice(7);

  // Try OAuth first (for MCP AuthInfo construction)
  try {
    const oauthResult = await verifyOAuthAccessToken(rawToken);
    if (oauthResult) {
      return {
        userId: oauthResult.userId,
        authInfo: buildAuthInfo(rawToken, oauthResult),
      };
    }
  } catch {
    // OAuth verification failed — fall through to API token
  }

  // Fall back to shared resolver (handles API tokens)
  const result = await resolveBearer(rawToken);
  if (result) {
    return { userId: result.userId };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Session + Server Factory
// ---------------------------------------------------------------------------

async function createSession(userId: string): Promise<McpSession> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      sessions.set(sessionId, session);
    },
    onsessionclosed: (sessionId: string) => {
      sessions.delete(sessionId);
    },
  });

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );

  registerTools(server);
  registerResources(server);
  await server.connect(transport);

  const session: McpSession = {
    transport,
    server,
    userId,
    lastAccess: Date.now(),
  };

  return session;
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:2000";

function jsonError(
  message: string,
  status: number,
  cors: Record<string, string>
): Response {
  const headers: Record<string, string> = {
    ...cors,
    "Content-Type": "application/json",
  };

  // RFC 9728: 401 responses MUST include WWW-Authenticate with resource_metadata
  if (status === 401) {
    headers["WWW-Authenticate"] =
      `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`;
  }

  return new Response(JSON.stringify({ error: message }), {
    status,
    headers,
  });
}

// ---------------------------------------------------------------------------
// MCP Access Check — server-level + user-level gate
// ---------------------------------------------------------------------------

async function mcpAccessCheck(
  userId: string,
  cors: Record<string, string>
): Promise<Response | null> {
  const serverSettings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { mcpEnabled: true },
  });
  if (!serverSettings?.mcpEnabled) {
    return jsonError("MCP is disabled", 403, cors);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mcpEnabled: true },
  });
  if (!user?.mcpEnabled) {
    return jsonError("MCP access is disabled for your account", 403, cors);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const cors = getCorsHeaders(request);

  try {
    // Authenticate (OAuth or API token)
    const auth = await authenticateRequest(request);
    if (!auth) return jsonError("Unauthorized", 401, cors);

    // Check MCP access (server + user level)
    const mcpBlock = await mcpAccessCheck(auth.userId, cors);
    if (mcpBlock) return mcpBlock;

    // Check for existing session
    const sessionId = request.headers.get("mcp-session-id");

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return jsonError("Session not found", 404, cors);
      if (session.userId !== auth.userId) return jsonError("Forbidden", 403, cors);

      session.lastAccess = Date.now();

      const response = await runWithContext(auth.userId, prisma, () =>
        session.transport.handleRequest(request, { authInfo: auth.authInfo })
      );
      return addCorsHeaders(response, cors);
    }

    // New session — create transport + server
    const session = await createSession(auth.userId);

    const response = await runWithContext(auth.userId, prisma, () =>
      session.transport.handleRequest(request, { authInfo: auth.authInfo })
    );
    return addCorsHeaders(response, cors);
  } catch (err) {
    console.error("[MCP] Unexpected error:", err);
    return jsonError("Internal server error", 500, cors);
  }
}

export async function GET(request: Request): Promise<Response> {
  const cors = getCorsHeaders(request);

  const auth = await authenticateRequest(request);
  if (!auth) return jsonError("Unauthorized", 401, cors);

  const mcpBlock = await mcpAccessCheck(auth.userId, cors);
  if (mcpBlock) return mcpBlock;

  const sessionId = request.headers.get("mcp-session-id");
  if (!sessionId) return jsonError("Session ID required", 400, cors);

  const session = sessions.get(sessionId);
  if (!session) return jsonError("Session not found", 404, cors);
  if (session.userId !== auth.userId) return jsonError("Forbidden", 403, cors);

  session.lastAccess = Date.now();

  const response = await runWithContext(auth.userId, prisma, () =>
    session.transport.handleRequest(request, { authInfo: auth.authInfo })
  );
  return addCorsHeaders(response, cors);
}

export async function DELETE(request: Request): Promise<Response> {
  const cors = getCorsHeaders(request);

  const auth = await authenticateRequest(request);
  if (!auth) return jsonError("Unauthorized", 401, cors);

  const mcpBlock = await mcpAccessCheck(auth.userId, cors);
  if (mcpBlock) return mcpBlock;

  const sessionId = request.headers.get("mcp-session-id");
  if (!sessionId) return jsonError("Session ID required", 400, cors);

  const session = sessions.get(sessionId);
  if (!session) return jsonError("Session not found", 404, cors);
  if (session.userId !== auth.userId) return jsonError("Forbidden", 403, cors);

  const response = await runWithContext(auth.userId, prisma, () =>
    session.transport.handleRequest(request, { authInfo: auth.authInfo })
  );
  return addCorsHeaders(response, cors);
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = getCorsHeaders(request);
  return new Response(null, { status: 204, headers: cors });
}
