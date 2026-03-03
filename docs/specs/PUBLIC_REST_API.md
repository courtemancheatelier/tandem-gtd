# Public REST API

**Status:** Draft
**Date:** 2026-02-24
**Priority:** High — unblocks third-party integrations, automation, and mobile apps

---

## 1. Problem

Tandem's REST API is fully built (60+ endpoints) but locked behind browser session cookies. External tools — scripts, iOS Shortcuts, Zapier, third-party apps, custom dashboards — can't call it. The MCP endpoint already accepts Bearer tokens (OAuth 2.1 and personal API tokens), but that only exposes the MCP tool interface, not the REST routes.

**Goal:** Let any HTTP client use the existing REST API with a Bearer token, with scoped permissions, rate limiting, and CORS support.

---

## 2. What Already Exists

| Piece | Status |
|---|---|
| REST API routes (60+) | Done — full CRUD for all GTD resources |
| `ApiToken` Prisma model | Done — bcrypt-hashed, optional expiry, prefix for lookup |
| Bearer token resolution | Done — `/api/mcp/route.ts` resolves OAuth + API tokens to userId |
| OAuth 2.1 server | Done — authorization_code + PKCE, token refresh/revoke |
| CSRF origin check | Done — middleware blocks cross-origin mutating requests |
| `getCurrentUserId()` | Done — reads NextAuth session cookie, returns userId or null |

**The gap:** `getCurrentUserId()` only checks session cookies. It needs a fallback to Bearer tokens. The CSRF middleware needs to skip origin checks for Bearer-authenticated requests (same as it does for `/api/mcp`).

---

## 3. Admin Setting — API Access Toggle

### 3.1 Schema

Add to the `AppSettings` model:

```prisma
apiAccessEnabled Boolean @default(false) // Master toggle for public REST API access via Bearer tokens
```

Default `false` — API access is opt-in. Admins explicitly enable it when they're ready for external integrations.

### 3.2 Admin UI

Add to the **Features** collapsible card in `ServerSettingsForm` (alongside the Gantt toggle):

- **Label:** "Public API Access"
- **Description:** "Allow users to create API tokens and access the REST API from external tools"
- **Icon:** `Globe` (from lucide-react)
- **Switch:** toggles `apiAccessEnabled`

### 3.3 Enforcement

- **`getAuthContext()`** — After resolving a Bearer token, check `AppSettings.apiAccessEnabled`. If `false`, return `null` (triggers 401). Session-cookie auth is unaffected.
- **Token management endpoints** (`/api/settings/api-tokens`) — Return 403 with `{"error": "API access is not enabled on this server"}` when disabled. Users can't create tokens if the feature is off.
- **Settings UI** — Hide the "API Tokens" section on the user settings page when `apiAccessEnabled` is `false`. Expose this flag via the existing `GET /api/settings/features` endpoint.

### 3.4 What Happens When Disabled After Tokens Exist

Existing tokens are **not deleted** — they just stop working. Bearer requests return 401. If the admin re-enables API access, all non-expired, non-revoked tokens resume working. This avoids destructive side effects from toggling the setting.

---

## 4. Auth Changes

### 4.1 Extend `getCurrentUserId()` in `src/lib/api/auth-helpers.ts`

```typescript
export async function getCurrentUserId(): Promise<string | null> {
  // 1. Try NextAuth session (browser cookies)
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session.user.id;

  // 2. Try Bearer token (API tokens / OAuth access tokens)
  const authHeader = headers().get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const userId = await resolveBearer(token);
    if (userId) return userId;
  }

  return null;
}
```

`resolveBearer()` reuses the same token resolution logic from the MCP route — check API tokens first (prefix lookup + bcrypt verify), then OAuth access tokens.

### 4.2 CSRF Bypass for Bearer Requests

In `src/lib/api/csrf.ts`, skip origin validation when a Bearer token is present:

```typescript
if (req.headers.get("authorization")?.startsWith("Bearer ")) return true;
```

Bearer tokens are proof of authentication on their own — the origin check exists to protect cookie-based auth from CSRF.

### 4.3 Extract Shared Token Resolution

Move the Bearer → userId resolution logic from `/api/mcp/route.ts` into a shared module (`src/lib/api/resolve-bearer.ts`) so both the MCP route and `getCurrentUserId()` use the same code.

---

## 5. API Token Management

### 5.1 Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings/api-tokens` | List user's tokens (id, name, prefix, scopes, expiresAt, lastUsedAt, createdAt) |
| `POST` | `/api/settings/api-tokens` | Create token — returns plaintext **once** |
| `DELETE` | `/api/settings/api-tokens/[id]` | Revoke a token |

### 5.2 Create Token Request

```json
{
  "name": "My Script",
  "scopes": ["read", "write"],
  "expiresInDays": 90
}
```

### 5.3 Create Token Response

```json
{
  "id": "clxyz...",
  "name": "My Script",
  "token": "tnm_a1b2c3d4...full-plaintext-token",
  "prefix": "tnm_a1b2",
  "scopes": ["read", "write"],
  "expiresAt": "2026-05-25T00:00:00Z"
}
```

The plaintext token is shown once and never stored. The DB stores only the bcrypt hash + 8-char prefix for lookup.

### 5.4 Token Format

`tnm_` prefix + 40 random hex chars = `tnm_a1b2c3d4e5f6...` (44 chars total). The `tnm_` prefix makes tokens identifiable in logs and secret scanners.

### 5.5 Schema Changes

Extend the existing `ApiToken` model:

```prisma
model ApiToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  tokenHash String
  prefix    String    // first 8 chars for lookup
  scopes    String[]  // ["read", "write"] or ["read"]
  expiresAt DateTime?
  lastUsedAt DateTime?
  createdAt DateTime  @default(now())
  revokedAt DateTime? // soft-revoke for audit trail

  @@index([prefix])
  @@index([userId])
}
```

---

## 6. Scopes

Two scopes, kept simple:

| Scope | Allows |
|---|---|
| `read` | All GET requests |
| `write` | All POST, PATCH, PUT, DELETE requests |

A read-only token (`["read"]`) can list tasks, projects, wiki articles, etc. but can't create or modify anything. A full token (`["read", "write"]`) can do everything the user can do in the UI.

### 6.1 Scope Enforcement

In `getCurrentUserId()` (or a new `getAuthContext()` helper), return both the userId and the scopes. Each API route already checks `if (!userId) return unauthorized()` — add a scope check:

```typescript
export async function getAuthContext(): Promise<AuthContext | null> { ... }

// In route handlers:
const auth = await getAuthContext();
if (!auth) return unauthorized();
if (!auth.hasScope("write")) return forbidden("Token requires 'write' scope");
```

Session-cookie users always have `["read", "write"]` — scopes only restrict API tokens.

---

## 7. Rate Limiting

### 7.1 Limits

| Auth type | Limit |
|---|---|
| API token | 120 requests / minute per token |
| OAuth access token | 120 requests / minute per token |
| Session cookie | No limit (browser UI) |

### 7.2 Implementation

In-memory sliding window counter keyed by token prefix. Returns `429 Too Many Requests` with headers:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1708819260
Retry-After: 23
```

### 7.3 Location

Rate limiting runs in `getCurrentUserId()` / `getAuthContext()` after token resolution, before returning the userId. This way every route gets it for free.

---

## 8. CORS

For API-token-authenticated requests, return permissive CORS headers so browser-based third-party apps (extensions, custom dashboards) can call the API:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

CORS only applies to Bearer-authenticated requests. Cookie-authenticated requests keep the existing same-origin behavior.

Handle `OPTIONS` preflight in middleware for `/api/` routes when an `Authorization` header is present.

---

## 9. Response Envelope

The existing API returns raw objects (`Task`, `Task[]`, `{ articles, hasMore }`). For the public API, keep the same response shapes — don't add a wrapper envelope. This avoids breaking the existing frontend and keeps responses clean.

Add standard error format documentation:

```json
{
  "error": "Human-readable error message"
}
```

HTTP status codes: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden / scope violation), 404 (Not Found), 429 (Rate Limited), 500 (Server Error).

---

## 10. Settings UI

Add a **"API Tokens"** section to the Settings page (`/settings`).

### 10.1 Token List View

Table showing: Name, Prefix (`tnm_a1b2...`), Scopes (badges), Created, Last Used, Expires, Revoke button.

### 10.2 Create Token Dialog

- **Name** — text input (required, max 100 chars)
- **Scopes** — checkboxes: Read, Write (read is always on)
- **Expiration** — select: 30 days, 90 days, 1 year, No expiration

After creation, show the full token in a copyable code block with a warning: "Copy this token now. You won't be able to see it again."

### 10.3 Revoke Confirmation

"Revoke token **My Script**? Any tools using this token will stop working immediately."

---

## 11. Implementation Plan

### Phase 1 — Admin Setting + Bearer Auth on All Routes
1. Add `apiAccessEnabled` to `AppSettings` model (migration, default `false`)
2. Expose via `GET/PATCH /api/admin/settings` and `GET /api/settings/features`
3. Add toggle to `ServerSettingsForm` Features card
4. Extract token resolution from MCP route into `src/lib/api/resolve-bearer.ts`
5. Update `getCurrentUserId()` → `getAuthContext()` to try Bearer after session cookie, gated by `apiAccessEnabled`
6. Update CSRF middleware to skip origin check for Bearer requests
7. Update all route handlers to use `getAuthContext()` (or keep `getCurrentUserId()` as a thin wrapper)
8. Test: existing session-cookie auth still works, API tokens work when enabled, blocked when disabled

### Phase 2 — Token Management API + Scopes
1. Add `scopes` and `revokedAt` fields to `ApiToken` model (migration)
2. Build `GET/POST/DELETE /api/settings/api-tokens` endpoints
3. Add scope enforcement in `getAuthContext()`
4. Add `lastUsedAt` tracking on each token use

### Phase 3 — Rate Limiting + CORS
1. In-memory rate limiter (sliding window, keyed by token prefix)
2. Rate limit headers on responses
3. CORS headers for Bearer-authenticated requests
4. OPTIONS preflight handling in middleware

### Phase 4 — Settings UI
1. API Tokens section in Settings page
2. Create token dialog with copy-once UX
3. Token list with revoke

---

## 12. What This Does NOT Cover

- **API versioning** — The API is currently v0 / unversioned. Versioning (`/api/v1/`) can be added later when there are external consumers who need stability guarantees.
- **OpenAPI / Swagger docs** — Can be auto-generated from Zod schemas in a follow-up.
- **Webhooks** — Outbound event notifications (task completed, project updated) are a separate feature.
- **OAuth for third-party apps** — The OAuth 2.1 server already exists for MCP clients. Extending it to general third-party apps is a separate concern.
- **Admin API** — Admin routes (`/api/admin/*`) are excluded from public API token access. Admin operations remain session-only.

---

## 13. Edge Cases

- **API access disabled** — Bearer requests return 401 with `{"error": "API access is not enabled"}`. Token management endpoints return 403. Existing tokens are preserved but inactive.
- **Expired token** — Return 401 with `{"error": "Token expired"}`. Client must create a new token.
- **Revoked token** — Return 401 with `{"error": "Token revoked"}`. Same as expired.
- **Token without required scope** — Return 403 with `{"error": "Token requires 'write' scope"}`.
- **Rate limited** — Return 429 with `Retry-After` header.
- **Admin routes with API token** — Return 403. Admin routes require session auth.
- **Token used after user deletion** — Cascade delete on `ApiToken` ensures tokens are deleted with the user. If a request races with deletion, the userId lookup will fail and return 401.
- **Multiple auth headers** — If both a session cookie and Bearer token are present, session cookie wins (existing behavior preserved, Bearer is fallback).
