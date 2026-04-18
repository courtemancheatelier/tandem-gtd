# MCP OAuth 2.1 Authorization Server

## Problem

Tandem's MCP HTTP endpoint (`/api/mcp`) currently uses Bearer token authentication via personal access tokens (API tokens generated in Settings). This works for clients that accept manual token entry (Claude Code, Claude Desktop via stdio), but **fails for Claude.ai and ChatGPT** because they require the MCP server to implement OAuth 2.1 per the MCP specification (2025-03-26).

When Claude.ai tries to connect:
1. It sends a request to `/api/mcp` with no token
2. Tandem responds 401
3. Claude.ai tries OAuth discovery at `/.well-known/oauth-authorization-server`
4. Gets 404 — no OAuth server exists
5. Falls back to default endpoints (`/authorize`, `/token`, `/register`) — also 404
6. Connection fails

## Goal

Implement an OAuth 2.1 authorization server within Tandem so that Claude.ai, ChatGPT, and any MCP client can connect to the MCP endpoint through a standard browser-based authorization flow. Users click "Connect," log in to Tandem in a popup, approve access, and the MCP client receives an access token automatically.

## MCP Spec Requirements (2025-03-26)

The MCP authorization spec requires:

| Endpoint | Required | Purpose |
|----------|----------|---------|
| `GET /.well-known/oauth-authorization-server` | SHOULD (servers), MUST (clients) | Metadata discovery — tells clients where all OAuth endpoints live |
| `GET /authorize` | MUST | Browser-based login + consent screen |
| `POST /token` | MUST | Exchange authorization code for access token, refresh tokens |
| `POST /register` | SHOULD | Dynamic client registration (RFC 7591) — lets unknown clients register automatically |

Additional requirements:
- PKCE is REQUIRED for all clients (code_challenge + code_verifier)
- Authorization Code grant type (user-facing)
- Access tokens sent as `Authorization: Bearer <token>` on every request
- Token refresh support
- HTTPS everywhere

## Architecture

### Tandem as its own OAuth Authorization Server

Tandem already has NextAuth for user sessions. The OAuth 2.1 server layer sits alongside it:

```
Claude.ai                          Tandem VPS
─────────                          ──────────
1. POST /api/mcp
                          ──→      401 Unauthorized
2. GET /.well-known/oauth-authorization-server
                          ──→      200 { authorization_endpoint, token_endpoint, ... }
3. POST /register
                          ──→      201 { client_id, client_secret }
4. Open browser → GET /authorize?client_id=...&code_challenge=...
                          ──→      Tandem login page (NextAuth session or login form)
                          ──→      User approves → redirect with ?code=...
5. POST /token (code + code_verifier)
                          ──→      200 { access_token, refresh_token, expires_in }
6. POST /api/mcp + Authorization: Bearer <access_token>
                          ──→      MCP session established
```

### Key Design Decisions

1. **Reuse NextAuth sessions** — The `/authorize` page checks for an existing NextAuth session. If logged in, show consent screen directly. If not, redirect to Tandem login, then back to consent.

2. **Prisma models for OAuth state** — Authorization codes, access tokens, refresh tokens, and registered clients stored in PostgreSQL. No in-memory-only state.

3. **Coexist with API tokens** — The existing Bearer token auth in `/api/mcp/route.ts` continues to work. The authenticate function tries OAuth tokens first, falls back to API tokens. No breaking changes.

4. **Scoped to MCP** — This OAuth server only issues tokens for the MCP endpoint, not a general-purpose OAuth provider.

## Data Model

### New Prisma Models

```prisma
model OAuthClient {
  id            String   @id @default(cuid())
  clientId      String   @unique
  clientSecret  String?  // Hashed. Null for public clients.
  clientName    String?
  redirectUris  String[] // Array of allowed redirect URIs
  grantTypes    String[] // ["authorization_code", "refresh_token"]
  responseTypes String[] // ["code"]
  scope         String?  // Default: "mcp"
  createdAt     DateTime @default(now())
}

model OAuthAuthorizationCode {
  id                  String   @id @default(cuid())
  code                String   @unique
  clientId            String
  userId              String
  redirectUri         String
  scope               String?
  codeChallenge       String   // PKCE
  codeChallengeMethod String   @default("S256")
  expiresAt           DateTime // Short-lived: 10 minutes
  used                Boolean  @default(false)
  createdAt           DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model OAuthAccessToken {
  id           String   @id @default(cuid())
  token        String   @unique // Hashed
  prefix       String   // First 8 chars for lookup (same pattern as ApiToken)
  clientId     String
  userId       String
  scope        String?
  expiresAt    DateTime // 1 hour default
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model OAuthRefreshToken {
  id           String   @id @default(cuid())
  token        String   @unique // Hashed
  prefix       String
  clientId     String
  userId       String
  scope        String?
  expiresAt    DateTime // 30 days
  revoked      Boolean  @default(false)
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Implementation Plan

### Phase 1: Metadata + Dynamic Registration (~2 hours)

**Step 1: Authorization Server Metadata**
- Create `src/app/.well-known/oauth-authorization-server/route.ts`
- Return JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported`, `token_endpoint_auth_methods_supported`
- All endpoints relative to `NEXTAUTH_URL`

**Step 2: Dynamic Client Registration**
- Create `src/app/api/oauth/register/route.ts`
- Accept POST with `redirect_uris`, `client_name`, `grant_types`, `response_types`, `token_endpoint_auth_method`
- Generate `client_id` + optional `client_secret`
- Store in `OAuthClient` table
- Return RFC 7591 compliant response

**Step 3: Prisma Schema**
- Add all 4 OAuth models to `schema.prisma`
- Run `prisma db push` (or create migration)

### Phase 2: Authorization Endpoint (~3 hours)

**Step 4: Authorization Page**
- Create `src/app/authorize/page.tsx` — consent screen UI
- Check NextAuth session: if not logged in, redirect to `/login?callbackUrl=/authorize?...` preserving all OAuth params
- Display: "Allow [client_name] to access your Tandem account via MCP?"
- Show scopes (read tasks, create tasks, etc.)
- Approve button → generate authorization code → redirect to `redirect_uri?code=...&state=...`

**Step 5: Authorization Code Generation**
- Create `src/app/api/oauth/authorize/route.ts` (POST handler for form submission)
- Validate `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, `state`
- Generate short-lived authorization code (10 min expiry)
- Store in `OAuthAuthorizationCode` with PKCE challenge
- Redirect to `redirect_uri` with `code` and `state`

### Phase 3: Token Endpoint (~2 hours)

**Step 6: Token Exchange**
- Create `src/app/api/oauth/token/route.ts`
- Handle `grant_type=authorization_code`:
  - Validate `code`, `client_id`, `redirect_uri`, `code_verifier` (PKCE S256 check)
  - Mark code as used (prevent replay)
  - Generate access token (1 hour) + refresh token (30 days)
  - Hash and store both tokens
  - Return `{ access_token, token_type: "Bearer", expires_in, refresh_token, scope }`
- Handle `grant_type=refresh_token`:
  - Validate refresh token, check not revoked/expired
  - Issue new access token + rotate refresh token
  - Return same format

### Phase 4: MCP Route Integration (~1 hour)

**Step 7: Dual Auth in MCP Route**
- Update `authenticateRequest` in `/api/mcp/route.ts`
- Try OAuth access token first (check `OAuthAccessToken` table by prefix)
- Fall back to existing API token check
- Both resolve to a `userId` — downstream code unchanged

**Step 8: Token Cleanup**
- Add a cleanup job (or extend existing session cleanup interval) to purge expired authorization codes, access tokens, and revoked refresh tokens

### Phase 5: Testing + Polish (~2 hours)

**Step 9: Test with Claude.ai**
- Deploy to VPS
- Add as connector in Claude.ai Settings → Connectors
- Verify full flow: discovery → register → authorize → token → MCP tools work

**Step 10: Test with ChatGPT**
- Add as App/Connector in ChatGPT settings
- Verify same flow works

**Step 11: Token Revocation UI**
- Add "Connected Apps" section to Settings page
- Show active OAuth clients with revoke button
- Revoking deletes all tokens for that client+user pair

## Estimated Total: ~10 hours

## Security Considerations

- Authorization codes are single-use, 10-minute expiry
- PKCE required (S256 only, no plain)
- Access tokens are short-lived (1 hour), hashed in DB
- Refresh tokens rotated on use (old token revoked when new one issued)
- Redirect URI must exactly match registered URI
- All endpoints over HTTPS (enforced by Cloudflare Tunnel)
- Rate limiting on `/token` endpoint to prevent brute force
- CSRF protection on `/authorize` consent form via NextAuth session

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/.well-known/oauth-authorization-server/route.ts` | Metadata discovery |
| `src/app/api/oauth/register/route.ts` | Dynamic client registration |
| `src/app/authorize/page.tsx` | Consent screen UI |
| `src/app/api/oauth/authorize/route.ts` | Authorization code generation |
| `src/app/api/oauth/token/route.ts` | Token exchange + refresh |
| `src/lib/oauth.ts` | Shared OAuth helpers (PKCE validation, token generation, hashing) |

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add 4 OAuth models |
| `src/app/api/mcp/route.ts` | Dual auth (OAuth token + API token fallback) |
| `src/app/(dashboard)/settings/page.tsx` | "Connected Apps" section (Phase 5) |
| `src/middleware.ts` | Ensure `/authorize` and OAuth endpoints bypass CSRF where needed |

## What This Does NOT Change

- Existing API token auth continues to work (Claude Code, Claude Desktop stdio)
- No changes to MCP tools, resources, or session management
- No changes to NextAuth login flow
- No changes to the in-app AI chat
