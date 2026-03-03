# MCP Streamable HTTP Transport & Multi-Client Compatibility

**Status:** Draft  
**Priority:** Phase 1 (prerequisite for remote MCP access from any client)  
**Depends on:** Existing MCP server (`src/mcp/server.ts`, `src/mcp/tools.ts`, `src/mcp/resources.ts`)  
**Unlocks:** Claude.ai remote MCP, Gemini CLI, Gemini Enterprise (when available), any MCP-compatible client

---

## Problem

Tandem's MCP server currently runs as a **standalone stdio process** (`npx tsx src/mcp/server.ts`). This works for local CLI tools like Claude Desktop and Gemini CLI when the user is on the same machine, but it cannot serve remote clients like:

- **Claude.ai** (browser-based, needs HTTPS endpoint)
- **Gemini CLI** connecting to a remote server (needs HTTP endpoint)
- **Gemini Enterprise** custom MCP connector (needs HTTPS + OAuth)
- **Any future MCP client** that connects over the network

The fix is a **Streamable HTTP transport** endpoint inside the Next.js app at `/api/mcp/`, which runs alongside the existing web UI and shares the same Prisma database connection.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     MCP Clients (Remote)                      │
│                                                               │
│  Claude.ai    Gemini CLI    Gemini Enterprise    Other MCP    │
│  (browser)    (terminal)    (Google Cloud)        Clients     │
└──────┬────────────┬──────────────┬──────────────────┬────────┘
       │            │              │                  │
       │     Streamable HTTP (POST /api/mcp/)         │
       │     Bearer token or OAuth 2.1                │
       ▼────────────▼──────────────▼──────────────────▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js App                                                  │
│                                                               │
│  ┌─────────────────────────┐   ┌───────────────────────────┐ │
│  │  /api/mcp/ route.ts     │   │  Existing stdio server    │ │
│  │  (Streamable HTTP)      │   │  (src/mcp/server.ts)      │ │
│  │                         │   │  Still works for local    │ │
│  │  • Auth middleware       │   │  Claude Desktop / Gemini  │ │
│  │  • CORS                 │   │  CLI on same machine      │ │
│  │  • Transport adapter    │   └───────────────────────────┘ │
│  └────────────┬────────────┘                                  │
│               │                                               │
│               ▼                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Shared MCP Server Instance                              │ │
│  │  (tools.ts + resources.ts — reused from src/mcp/)        │ │
│  │                                                           │ │
│  │  Tools: tandem_inbox_add, tandem_task_create,            │ │
│  │         tandem_task_complete, tandem_task_list,           │ │
│  │         tandem_what_now, tandem_project_list,             │ │
│  │         tandem_project_create, tandem_search,             │ │
│  │         tandem_waiting_for_list, tandem_review_status     │ │
│  │                                                           │ │
│  │  Resources: tandem://gtd-summary, tandem://contexts,     │ │
│  │             tandem://projects/{id}                        │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                   │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Prisma + PostgreSQL (shared with web app)               │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Key insight:** The tool handlers and resource handlers in `src/mcp/tools.ts` and `src/mcp/resources.ts` are pure functions that talk to Prisma. They don't care about the transport. We reuse them as-is — only the transport layer and auth change.

---

## Implementation

### 1. Next.js API Route: `/api/mcp/route.ts`

This is the core of the implementation. A single route handler that speaks Streamable HTTP transport.

```typescript
// src/app/api/mcp/route.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "@/mcp/tools";
import { registerResources } from "@/mcp/resources";
import { validateMcpToken } from "@/lib/mcp/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Stateless Streamable HTTP transport.
 *
 * Each request creates a fresh transport + server pair.
 * This is the recommended pattern for serverless / edge-compatible
 * deployments and avoids session management complexity.
 *
 * Stateless mode works because Tandem's MCP tools are pure
 * request-response (no server-initiated notifications needed).
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Default allowed origins (always included)
const DEFAULT_ORIGINS = [
  "https://claude.ai",
  "https://gemini.google.com",
];

function getAllowedOrigins(): string[] {
  return [...new Set([...DEFAULT_ORIGINS, ...ALLOWED_ORIGINS])];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Accept, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

/**
 * Create a fresh MCP server instance with all tools and resources.
 * The userId is injected from the authenticated token.
 */
function createMcpServer(userId: string): Server {
  const server = new Server(
    { name: "tandem-gtd", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // registerTools and registerResources need to resolve userId
  // from the request context rather than env vars.
  // See section 3 below for the refactor.
  registerTools(server, userId);
  registerResources(server, userId);

  return server;
}

// ── OPTIONS (CORS preflight) ──────────────────────────────────

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

// ── POST (main MCP request handler) ──────────────────────────

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Authenticate
  const authResult = await validateMcpToken(req);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: 401, headers: cors }
    );
  }

  // Check admin toggle
  if (!process.env.MCP_ENABLED && process.env.MCP_ENABLED !== undefined) {
    return NextResponse.json(
      { error: "MCP server is disabled" },
      { status: 503, headers: cors }
    );
  }

  try {
    const server = createMcpServer(authResult.userId);

    // Stateless: no session ID generator
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Wire up server to transport
    await server.connect(transport);

    // Let the transport handle the request and produce the response.
    // The transport reads req.body and writes to a Response.
    const body = await req.json();

    // Create a passthrough response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Create a minimal ServerResponse-like interface
    // that the transport can write to.
    // NOTE: Exact implementation depends on SDK version.
    // The v2 SDK may provide a simpler adapter for Next.js.
    // See section 6 (Open Questions) for alternatives.
    await transport.handleRequest(req, body);

    // For stateless JSON response mode, we can read directly:
    const response = transport.getResponse();

    return new NextResponse(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors,
      },
    });
  } catch (error) {
    console.error("[MCP HTTP] Error:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
      { status: 500, headers: cors }
    );
  }
}

// ── GET (SSE fallback for legacy clients) ─────────────────────

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "This endpoint uses Streamable HTTP transport. " +
          "Send POST requests with MCP JSON-RPC messages. " +
          "SSE transport is not supported.",
      },
      id: null,
    },
    { status: 405, headers: corsHeaders(origin) }
  );
}

// ── DELETE (session cleanup — no-op for stateless) ────────────

export async function DELETE(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
```

**Important SDK note:** The `@modelcontextprotocol/sdk` v1.x `StreamableHTTPServerTransport` is built around Node.js `IncomingMessage`/`ServerResponse` objects. Next.js App Router uses the Web `Request`/`Response` APIs. There are three approaches to bridge this:

1. **Use the `@modelcontextprotocol/node` middleware package** — wraps Node.js HTTP for you. Requires a custom server or API route that exposes raw Node streams.
2. **Use `enableJsonResponse: true`** — In stateless mode with JSON responses, you can handle the JSON-RPC request/response manually without SSE streaming. This is the simplest path for Next.js App Router.
3. **Use Next.js Pages Router** for the `/api/mcp` route — Pages Router API routes expose `req`/`res` as Node.js objects, which the SDK transport expects natively.

**Recommendation: Option 3 (Pages Router) for the MCP route.** Keep the rest of the app on App Router. This avoids fighting the SDK's transport assumptions. Put the route at `src/pages/api/mcp.ts`.

### 2. Auth Middleware: `src/lib/mcp/auth.ts`

```typescript
// src/lib/mcp/auth.ts

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

interface AuthSuccess {
  ok: true;
  userId: string;
}

interface AuthFailure {
  ok: false;
  error: string;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * Validate an MCP bearer token from the Authorization header.
 *
 * Tokens are stored in the McpToken table, hashed with SHA-256.
 * Each token is scoped to a single user.
 *
 * Future: OAuth 2.1 support for multi-user deployments.
 */
export async function validateMcpToken(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, error: "Invalid Authorization format. Use: Bearer <token>" };
  }

  const rawToken = match[1];

  // Hash the token to compare against stored hash
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Look up token
  const tokenRecord = await prisma.mcpToken.findFirst({
    where: {
      tokenHash: hashHex,
      revokedAt: null,
    },
    include: {
      user: { select: { id: true, isActive: true } },
    },
  });

  if (!tokenRecord) {
    return { ok: false, error: "Invalid or revoked token" };
  }

  if (!tokenRecord.user.isActive) {
    return { ok: false, error: "User account is inactive" };
  }

  // Update last used timestamp (fire and forget)
  prisma.mcpToken
    .update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {}); // Non-blocking

  return { ok: true, userId: tokenRecord.user.id };
}
```

### 3. Database: McpToken Model

Add to `prisma/schema.prisma`:

```prisma
model McpToken {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String    @default("Default")    // Human label: "Claude.ai", "Gemini CLI", etc.
  tokenHash   String    @unique                 // SHA-256 hash of the raw token
  prefix      String                            // First 8 chars of token for identification
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?                         // Soft delete — null means active

  @@index([tokenHash])
  @@index([userId])
}
```

### 4. Token Management API

```typescript
// src/app/api/settings/mcp-tokens/route.ts

import { randomBytes, createHash } from "crypto";

// POST — Generate a new MCP token
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  const { name } = await req.json();

  // Generate a secure random token
  // Format: tndm_<40 hex chars> (recognizable prefix)
  const rawToken = `tndm_${randomBytes(20).toString("hex")}`;
  const prefix = rawToken.slice(0, 13); // "tndm_" + first 8 hex

  // Store only the hash
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const record = await prisma.mcpToken.create({
    data: {
      userId,
      name: name || "Default",
      tokenHash,
      prefix,
    },
  });

  // Return the raw token ONCE — it cannot be retrieved again
  return NextResponse.json({
    id: record.id,
    name: record.name,
    token: rawToken, // Only time this is visible
    prefix: record.prefix,
    createdAt: record.createdAt,
  });
}

// GET — List tokens (prefix + metadata only, never the raw token)
// DELETE — Revoke a token (set revokedAt)
```

### 5. Refactor: userId Injection for Shared Tool Handlers

The current `src/mcp/tools.ts` gets `userId` from `getUserId()` which reads `TANDEM_USER_ID` from env vars. For the HTTP transport, userId comes from the authenticated token instead.

**Refactor approach:** Make `registerTools` and `registerResources` accept a `userId` parameter:

```typescript
// Before (src/mcp/tools.ts)
export function registerTools(server: Server): void {
  // userId resolved from env via getUserId()
}

// After
export function registerTools(server: Server, userId?: string): void {
  // If userId provided (HTTP transport), use it.
  // If not (stdio transport), fall back to getUserId() from env.
  const resolvedUserId = userId || getUserId();
}
```

This is a backwards-compatible change. The stdio server continues to work unchanged, while the HTTP route passes the authenticated userId.

---

## Gemini-Specific Compatibility

### Schema Quirks

Gemini CLI automatically strips `$schema` and `additionalProperties` from tool input schemas and sanitizes tool names. Tandem's tools already follow MCP conventions (`tandem_*` naming, standard JSON Schema), so most things work out of the box. However:

1. **No `additionalProperties` in schemas.** Don't include this field in tool `inputSchema` definitions. Tandem's current schemas don't, so no change needed.

2. **Tool name sanitization.** Gemini replaces special characters in tool names. Tandem uses `tandem_snake_case` which is safe.

3. **Resources are tools-only in Gemini.** Gemini's MCP support currently only accesses tools (via `list_tools`). Resources and prompts are not read. This means `tandem://gtd-summary` and `tandem://contexts` won't be available in Gemini — but the data they provide is also accessible via `tandem_review_status` and `tandem_task_list` tools, so functionality isn't lost.

4. **`enum` values in schemas.** Gemini is stricter about schema validation. Ensure all `enum` arrays contain only string values (no mixed types). Tandem's current enums are all strings — verified.

### Transport Compatibility Matrix

| Client | Transport | Auth | Status |
|--------|-----------|------|--------|
| **Claude Desktop** | stdio (local) | `TANDEM_USER_ID` env var | ✅ Works today |
| **Claude.ai** | Streamable HTTP (remote) | Bearer token | 🔨 This spec |
| **Claude Code** | stdio (local) | `TANDEM_USER_ID` env var | ✅ Works today |
| **Gemini CLI** (local) | stdio (local) | `TANDEM_USER_ID` env var | ✅ Works today |
| **Gemini CLI** (remote) | Streamable HTTP | Bearer token | 🔨 This spec |
| **Gemini Enterprise** | Streamable HTTP | OAuth 2.1 | ⏳ Phase 4 (requires allowlist from Google) |
| **Gemini web app** (gemini.google.com) | Not supported | — | ❌ Google hasn't opened custom MCP for consumer Gemini |
| **ChatGPT** | Streamable HTTP | Bearer token | 🔨 This spec (if OpenAI adds MCP client support) |

### Gemini CLI Remote Configuration

Once the HTTP endpoint is live, users configure Gemini CLI like this:

```json
// ~/.gemini/extensions/tandem/gemini-extension.json
{
  "name": "tandem-gtd",
  "version": "1.0.0",
  "mcpServers": {
    "tandem": {
      "httpUrl": "https://tandem.yourdomain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer tndm_abc123..."
      },
      "timeout": 30000
    }
  }
}
```

Or in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "tandem": {
      "httpUrl": "https://tandem.yourdomain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer tndm_abc123..."
      }
    }
  }
}
```

### Claude.ai Remote Configuration

```
MCP Server URL: https://tandem.yourdomain.com/api/mcp
Authentication: Bearer Token
Token: tndm_abc123...
```

---

## Gemini Enterprise / OAuth 2.1 (Future — Phase 4)

Gemini Enterprise requires OAuth 2.1 with Authorization URL, Token URL, Client ID, and Client Secret. This is the same OAuth implementation needed for multi-user Tandem deployments.

When implemented, Tandem acts as an OAuth 2.1 provider:

```
Authorization URL: https://tandem.yourdomain.com/oauth/authorize
Token URL:         https://tandem.yourdomain.com/oauth/token
Client ID:         (configured in Tandem admin)
Client Secret:     (configured in Tandem admin)
Scopes:            tandem:read tandem:write
```

This is out of scope for this spec but documented here for planning. The bearer token approach covers all current use cases.

---

## Settings UI: MCP Token Management

Add a section to the existing Settings page for managing MCP access tokens.

### Location

Settings → Integrations → MCP Access Tokens

### UI Components

```
┌─────────────────────────────────────────────────────────┐
│  MCP Access Tokens                                       │
│                                                          │
│  Connect Tandem to AI assistants like Claude and Gemini  │
│  using the Model Context Protocol.                       │
│                                                          │
│  Endpoint: https://tandem.yourdomain.com/api/mcp        │
│  [Copy URL]                                              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Claude.ai          tndm_a1b2...  Last used: 2h ago│ │
│  │                                          [Revoke]  │ │
│  ├────────────────────────────────────────────────────┤ │
│  │  Gemini CLI          tndm_c3d4...  Never used      │ │
│  │                                          [Revoke]  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [+ Generate New Token]                                  │
│                                                          │
│  ── Quick Setup Guides ──                                │
│                                                          │
│  ▸ Claude.ai                                             │
│  ▸ Claude Desktop                                        │
│  ▸ Gemini CLI                                            │
│  ▸ Gemini CLI (remote)                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Token Generation Flow

1. User clicks "Generate New Token"
2. Modal appears with a name field (default: "New Token")
3. Token is generated and displayed **once** in a copyable field with a warning: "Copy this token now — you won't be able to see it again."
4. User copies token, modal closes
5. Token appears in the list showing only the prefix (`tndm_a1b2...`)

### Quick Setup Guides (expandable sections)

Each guide shows copy-pasteable config for that client:

**Claude.ai:**
> 1. Go to Claude.ai → Settings → Integrations → Add MCP Server
> 2. Server URL: `https://tandem.yourdomain.com/api/mcp`
> 3. Auth: Bearer Token → paste your token

**Gemini CLI (remote):**
> Create `~/.gemini/extensions/tandem/gemini-extension.json`:
> ```json
> {
>   "name": "tandem-gtd",
>   "version": "1.0.0",
>   "mcpServers": {
>     "tandem": {
>       "httpUrl": "https://tandem.yourdomain.com/api/mcp",
>       "headers": {
>         "Authorization": "Bearer YOUR_TOKEN_HERE"
>       }
>     }
>   }
> }
> ```

**Claude Desktop / Gemini CLI (local — stdio):**
> Add to your MCP config (`claude_desktop_config.json` or `settings.json`):
> ```json
> {
>   "mcpServers": {
>     "tandem": {
>       "command": "npx",
>       "args": ["tsx", "/path/to/tandem/src/mcp/server.ts"],
>       "env": {
>         "DATABASE_URL": "postgresql://...",
>         "TANDEM_USER_ID": "your-user-id"
>       }
>     }
>   }
> }
> ```
> Note: Local stdio is faster (no network hop) but requires Tandem source code on your machine.

---

## Environment Variables

```env
# ── MCP HTTP Transport ────────────────────────────────────

# Enable/disable the HTTP MCP endpoint (default: true if any token exists)
MCP_ENABLED=true

# Additional allowed CORS origins (comma-separated)
# claude.ai and gemini.google.com are always allowed
MCP_ALLOWED_ORIGINS=https://your-custom-client.com

# Rate limiting: max requests per token per minute (default: 60)
MCP_RATE_LIMIT=60
```

---

## Nginx Configuration

Already specced in `DEPLOYMENT_NOTES.md` — the `/api/mcp` location block with SSE support headers (`proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding on`) handles Streamable HTTP correctly. No changes needed.

---

## Security Considerations

1. **Tokens are hashed.** Raw tokens are never stored. Even if the database is compromised, tokens can't be extracted.

2. **CORS is restrictive.** Only explicitly allowed origins can make cross-origin requests. The MCP endpoint doesn't serve HTML, so CSRF isn't a risk, but CORS prevents unauthorized browser-based access.

3. **Rate limiting.** Per-token rate limiting (default 60 req/min) prevents abuse. MCP tool calls are typically low-frequency — a busy user might make 20-30 tool calls in a weekly review session.

4. **Token revocation is instant.** Revoking a token sets `revokedAt` and takes effect on the next request. No cache to flush.

5. **HTTPS required in production.** Bearer tokens over HTTP are insecure. The deployment guide already requires HTTPS via Let's Encrypt or Cloudflare.

6. **No tool-level permissions (yet).** All tokens have full read/write access to the user's GTD data. Fine-grained permissions (read-only tokens, tool allowlists) can be added later if needed.

---

## Testing Plan

### Unit Tests

- Token generation: correct format (`tndm_` prefix, 40 hex chars)
- Token hashing: SHA-256 matches stored hash
- Auth middleware: valid token → userId, invalid → 401, revoked → 401
- CORS: allowed origins get headers, unknown origins don't

### Integration Tests

- POST `/api/mcp` with valid token + `tools/list` → returns tool definitions
- POST `/api/mcp` with valid token + `tools/call` → executes tool, returns result
- POST `/api/mcp` without token → 401
- POST `/api/mcp` with revoked token → 401
- OPTIONS `/api/mcp` → 204 with CORS headers

### Manual Client Tests

```bash
# Test with curl (JSON-RPC)
curl -X POST https://tandem.yourdomain.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tndm_your_token_here" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'

# Test tool call
curl -X POST https://tandem.yourdomain.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tndm_your_token_here" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "tandem_inbox_add",
      "arguments": { "title": "Test from curl" }
    },
    "id": 2
  }'
```

### Gemini CLI Smoke Test

```bash
# Install Gemini CLI
npm install -g @google/gemini-cli@latest

# Add Tandem as remote MCP server
gemini mcp add tandem --httpUrl https://tandem.yourdomain.com/api/mcp

# Verify connection
gemini
> /mcp
# Should list tandem tools

# Test a tool call
> Add "buy milk" to my Tandem inbox
# Should call tandem_inbox_add
```

---

## Implementation Order

1. **Prisma migration** — Add `McpToken` model
2. **Token management API** — Generate, list, revoke endpoints
3. **Auth middleware** — `validateMcpToken()`
4. **Refactor tool/resource handlers** — Accept `userId` parameter
5. **HTTP route** — `/api/mcp` (or `pages/api/mcp.ts`) with Streamable HTTP transport
6. **CORS** — Allow claude.ai and gemini.google.com origins
7. **Settings UI** — Token management + setup guides
8. **Test** — curl, Claude.ai, Gemini CLI
9. **Update deployment docs** — Document the new endpoint and token setup

---

## Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.12.0",
  "@modelcontextprotocol/node": "^0.1.0"
}
```

The `@modelcontextprotocol/node` package provides the `NodeStreamableHTTPServerTransport` that works with Node.js `IncomingMessage`/`ServerResponse` — needed if using Pages Router for the MCP route. If SDK v2 ships before implementation (expected Q1 2026), it may include better Web API support that works natively with App Router.

---

## Open Questions

1. **Pages Router vs App Router for `/api/mcp`?** The MCP SDK's HTTP transport assumes Node.js streams. Pages Router gives us native `req`/`res` objects. App Router requires an adapter. Pages Router is the path of least resistance, but mixing routers adds slight complexity. **Recommendation: Pages Router for this one route.**

2. **Stateless vs stateful transport?** Stateless (no sessions) is simpler and works for all current Tandem tools since they're pure request-response. Stateful sessions would be needed for server-initiated notifications (e.g., "a task was completed by another team member"). **Recommendation: Ship stateless, add sessions if needed later.**

3. **Should the admin MCP toggle also revoke all tokens?** Currently `mcpEnabled` in server settings just blocks the endpoint. Tokens remain valid. If MCP is re-enabled, existing tokens work again. **Recommendation: Keep them separate — the toggle is a quick kill switch, revocation is deliberate.**

4. **SDK v1 vs v2?** The v2 SDK is expected Q1 2026 and adds middleware packages for various frameworks. If it ships before we implement this, we should use v2 directly. If not, build on v1 with the Pages Router approach and plan a clean migration. **Recommendation: Start with v1, upgrade opportunistically.**
