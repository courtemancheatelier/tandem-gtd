# Security Review — v1.8 and Earlier

**Date:** 2026-03-06
**Scope:** All pre-v1.9 features (API routes, auth, admin, services, middleware, MCP, import/export)

---

## HIGH (1)

- [x] **H1 — Invite code validation has no rate limiting**
  `src/app/api/invites/validate/route.ts`
  Public endpoint with no auth or rate limiting. Invite codes are `TND-XXXX` format (30-char charset, 4 random chars = ~810K combinations). An attacker can brute-force valid codes at network speed.
  **Fix:** Add IP-based rate limiting: `checkRateLimit('invite-validate:${ip}', 10, 60_000)`.

---

## MEDIUM (4)

- [x] **M1 — Admin: Error details leaked in user deletion**
  `src/app/api/admin/users/[id]/route.ts` L191
  `err.message` returned to client in 500 response. Could expose DB or internal error details.
  **Fix:** Return generic `"Failed to delete user"` message, log full error server-side.

- [x] **M2 — Admin: SMTP error details leaked in email test**
  `src/app/api/admin/email-test/route.ts` L40-42
  `err.message` from email send failure returned to client. Could expose SMTP host, port, or auth errors.
  **Fix:** Return `"Failed to send test email"` without the inner message.

- [x] **M3 — Auth: Setup-password token status enumeration**
  `src/app/api/auth/setup-password/route.ts` L38-56
  Returns different error messages for "not found" vs "already used" vs "expired" vs "disabled". An attacker with a valid token format can distinguish these states.
  **Fix:** Return a single generic error for all invalid cases: `"Invalid or expired setup link"`.

- [x] **M4 — Admin Import: No schema validation on server import data**
  `src/lib/import/server-import-processor.ts` L54-68
  Parses JSON and checks `version` and `users` array existence, but doesn't validate individual user objects with Zod. Malformed data (missing email, invalid types) passes through to prisma.user.create where it may cause cryptic DB errors.
  **Fix:** Add Zod schema for `ServerExportUser` with required fields (email as z.string().email(), name, isAdmin).

---

## LOW (3)

- [x] **L1 — OAuth: State parameter not required**
  `src/app/api/oauth/authorize/route.ts` L44, 131
  State is accepted but optional. Per OAuth 2.1 best practice, state SHOULD be required for CSRF protection on the authorization response redirect.
  **Fix:** Require state parameter: `if (!state) return error("invalid_request", "state is required")`.

- [x] **L2 — Invite code entropy is low**
  `src/lib/invite-codes.ts` L6-12
  `TND-XXXX` has only ~810K combinations (30^4). Even with rate limiting (H1), the code space is small. Consider for future improvement.
  **Fix:** Increase to 6 characters (`TND-XXXXXX` = ~729M combinations) for better security margin.

- [x] **L3 — Tasks/Projects GET have no pagination limit**
  `src/app/api/tasks/route.ts` L27, `src/app/api/projects/route.ts`
  `findMany()` without `take` limit. A user with many records causes large responses. Low risk since queries are userId-scoped (only affects the requesting user's performance).
  **Deferred:** UI expects all records. Risk is self-inflicted only. Consider adding pagination when user counts grow.

---

## Verified Secure (Notable)

These areas were specifically audited and found properly implemented:

- **IDOR protection** — All `[id]` routes filter by `userId` before returning/modifying resources
- **Auth on all routes** — Every non-public endpoint calls `requireAuth()` or `requireAdmin()`
- **SQL injection** — All raw queries use `Prisma.sql` parameterized templates
- **Input validation** — All POST/PATCH routes use Zod schemas
- **Admin self-protection** — Cannot remove own admin status, disable own account, or delete own account
- **OAuth PKCE** — Proper S256 code challenge, single-use codes, 10-min expiry
- **Redirect URI** — Exact-match validation on OAuth redirects
- **Token security** — API tokens require session-only auth for create/revoke (prevents token-based DoS)
- **Session security** — httpOnly cookies, sameSite=lax, short-lived linking/invite cookies
- **Push subscriptions** — Properly scoped to userId, no cross-user subscription possible
- **Account deletion** — Session-only auth, email confirmation required
- **Cascade engine** — Only called from task-service which validates ownership first
- **Export** — Scoped to userId, no cross-user data leakage
- **Rate limiting** — Applied on OAuth register, OAuth token, email test, password setup, email webhook
