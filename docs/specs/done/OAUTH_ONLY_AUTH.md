# OAuth-Only Authentication — Remove Username/Password Login

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Tandem currently supports three auth methods: Google OAuth, Apple OAuth, and email/password credentials. The credentials path creates maintenance burden:

- **Password resets** — no self-serve reset flow exists. When a user forgets their password, the admin must manually set a new one via the admin panel.
- **Security surface** — storing hashed passwords means defending against credential stuffing, brute force, and breach exposure. OAuth delegates all of this to Google/Apple/GitHub/Microsoft.
- **Admin friction** — creating a user via admin requires setting a password. With OAuth-only, admin creates the account and the user links their OAuth provider on first login.
- **No added value** — every target user already has a Google, Apple, GitHub, or Microsoft account. The credentials path exists because it was the default NextAuth starter, not because users need it.

### What "Done" Looks Like

1. The only way to sign in is Google, Apple, GitHub, or Microsoft OAuth.
2. The login page shows OAuth buttons only — no email/password form.
3. Admin can create users without setting a password. The user links OAuth on first sign-in.
4. Existing credentials-only users are prompted to link an OAuth account.
5. The `CredentialsProvider` is removed from the NextAuth config.
6. Password-related UI is removed from admin user management.
7. A new `ServerSettings.authMode` toggle lets the admin switch between `OAUTH_ONLY` (new default) and `OAUTH_AND_CREDENTIALS` (legacy fallback) so credentials can be re-enabled if needed during transition.

### Design Constraints

- NextAuth.js session strategy remains JWT
- bcryptjs dependency stays — it's used for OAuth token hashing in `src/lib/oauth.ts`
- Must not break MCP OAuth 2.1 server (separate system, uses API tokens)
- Must not break the Beta Access Gate / waitlist flow (already OAuth-only)
- At least one admin must have a linked OAuth account before credentials can be disabled

---

## 2. Add GitHub and Microsoft OAuth Providers

Before removing credentials, add GitHub and Microsoft as additional OAuth options. GitHub covers developers and technical teams. Microsoft covers anyone with an Outlook, Hotmail, or Microsoft 365 work/school account — a huge share of enterprise and corporate users.

### 2.1 NextAuth Config

**File:** `src/lib/auth.ts`

```ts
import GitHubProvider from "next-auth/providers/github";
import MicrosoftEntraIDProvider from "next-auth/providers/microsoft-entra-id";

// Add alongside Google and Apple conditionals:
...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  ? [GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })]
  : []),
...(process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET
  ? [MicrosoftEntraIDProvider({
      clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_ENTRA_ID_TENANT_ID || "common",
      // "common" allows personal Microsoft accounts + any org tenant
      // Set a specific tenant ID to restrict to one organization
    })]
  : []),
```

### 2.2 Environment Variables

```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

MICROSOFT_ENTRA_ID_CLIENT_ID=...
MICROSOFT_ENTRA_ID_CLIENT_SECRET=...
MICROSOFT_ENTRA_ID_TENANT_ID=common
```

**GitHub:** Create an OAuth App at https://github.com/settings/developers with callback URL `https://tandem.example.com/api/auth/callback/github`.

**Microsoft:** Register an app at https://entra.microsoft.com (Azure portal → App registrations). Set redirect URI to `https://tandem.example.com/api/auth/callback/microsoft-entra-id`. Under "Supported account types" select "Accounts in any organizational directory and personal Microsoft accounts" to allow both work/school and personal Outlook/Hotmail accounts.

### 2.3 Login Page

Add GitHub and Microsoft buttons alongside Google and Apple. Use the same conditional pattern — only show each button if the provider's env vars are configured. With all four providers the login page covers:

- **Google** — Gmail, Google Workspace (corporate)
- **Apple** — iCloud, Apple ID
- **GitHub** — developers, technical teams
- **Microsoft** — Outlook, Hotmail, Microsoft 365 work/school accounts

### 2.4 Existing signIn Callback

The OAuth account linking logic in the `signIn` callback is provider-agnostic — it handles any provider via `account.provider` and `account.providerAccountId`. Both GitHub and Microsoft work out of the box with the existing Case 1/2/3 logic. No callback changes needed.

---

## 3. Auth Mode Toggle

### 3.1 ServerSettings Field

```prisma
// Add to ServerSettings:
authMode  AuthMode @default(OAUTH_ONLY)

enum AuthMode {
  OAUTH_ONLY              // Only OAuth sign-in (Google, Apple, GitHub, Microsoft)
  OAUTH_AND_CREDENTIALS   // OAuth + email/password (legacy)
}
```

This is the safety valve. If something goes wrong with OAuth providers, the admin can flip back to `OAUTH_AND_CREDENTIALS` to restore password login without a code deploy.

### 3.2 Auth Config Reads the Toggle

**File:** `src/lib/auth.ts`

The `CredentialsProvider` is conditionally included based on `authMode`:

```ts
// At the top of authOptions (or inside a function that builds providers):
const serverSettings = await prisma.serverSettings.findFirst();
const authMode = serverSettings?.authMode ?? "OAUTH_ONLY";

const providers = [
  // OAuth providers (always available when configured)
  ...(process.env.GOOGLE_CLIENT_ID ? [GoogleProvider({...})] : []),
  ...(process.env.APPLE_ID ? [AppleProvider({...})] : []),
  ...(process.env.GITHUB_CLIENT_ID ? [GitHubProvider({...})] : []),
  ...(process.env.MICROSOFT_ENTRA_ID_CLIENT_ID ? [MicrosoftEntraIDProvider({...})] : []),

  // Credentials (only when authMode allows it)
  ...(authMode === "OAUTH_AND_CREDENTIALS" ? [CredentialsProvider({...})] : []),
];
```

**Note:** NextAuth's `authOptions` is typically a static export. Since this needs a DB read, the providers list may need to be built dynamically. Two approaches:

1. **Read at startup + cache** — fetch `authMode` once on server start, cache in memory. Admin setting change requires server restart (acceptable for a rare toggle).
2. **Dynamic auth handler** — wrap the NextAuth handler to read settings per-request. More flexible but adds a DB query per auth request.

Recommend approach 1 for simplicity. The `authMode` toggle is a rare operation, and restarting the service after changing it is fine (it's already required for env var changes).

### 3.3 Admin UI Toggle

**File:** `src/components/admin/ServerSettingsForm.tsx`

Add a radio group in the admin settings, similar to the `registrationMode` toggle from the Beta Access Gate spec:

```
Authentication
  ┌─ ○ OAuth only (Recommended) ─────────────────────┐
  │  Users sign in with Google, Apple, GitHub, or Microsoft.     │
  │  No passwords to manage.                          │
  └───────────────────────────────────────────────────┘
  ┌─ ○ OAuth + Password ─────────────────────────────┐
  │  Users can also sign in with email and password.  │
  │  Admin must handle password resets manually.       │
  └───────────────────────────────────────────────────┘
```

**Safety check:** Before allowing switch to `OAUTH_ONLY`, verify at least one admin user has a linked OAuth account. If the only admin is credentials-only, show a warning:

> "Cannot disable password login: admin [name] has no linked OAuth account. They would be locked out."

### 3.4 Admin Settings API

**File:** `src/app/api/admin/settings/route.ts`

- Add `authMode` to `GET` defaults and `PATCH` allowedFields
- Add validation in `PATCH`: before setting `OAUTH_ONLY`, query for admin users with no OAuth accounts. Reject with 400 if any exist.

---

## 4. Remove Password from Auth Flow

### 4.1 Login Page

**File:** `src/app/(auth)/login/page.tsx`

When `authMode === OAUTH_ONLY`:
- Remove the email/password form entirely
- Remove the "or continue with email" divider
- Show only OAuth provider buttons (Google, Apple, GitHub)
- Keep error handling for OAuth errors (OAuthAccountNotLinked, etc.)

When `authMode === OAUTH_AND_CREDENTIALS`:
- Keep current layout with both OAuth buttons and email/password form

The login page already fetches `registrationMode` for the waitlist UI. Extend that public endpoint to also return `authMode`:

**File:** `src/app/api/auth/registration-mode/route.ts`

Rename to `src/app/api/auth/config/route.ts` (or keep and add field):

```ts
return NextResponse.json({
  registrationMode: settings?.registrationMode ?? "WAITLIST",
  authMode: settings?.authMode ?? "OAUTH_ONLY",
  providers: {
    google: !!process.env.GOOGLE_CLIENT_ID,
    apple: !!process.env.APPLE_ID,
    github: !!process.env.GITHUB_CLIENT_ID,
    microsoft: !!process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
  },
});
```

This tells the login page which OAuth buttons to show and whether to render the password form.

### 4.2 signIn Callback Cleanup

**File:** `src/lib/auth.ts`

When `authMode === OAUTH_ONLY`:
- The `account.provider === "credentials"` branch in the signIn callback is dead code (CredentialsProvider isn't registered, so it never fires)
- Can be left as-is (no harm) or removed for clarity

### 4.3 Rate Limiting

**File:** `src/lib/auth.ts`

The rate limiter for `login:${credentials.email}` (5 attempts per 15 min) only applies to credentials auth. When `OAUTH_ONLY`:
- This code is dead (credentials flow never executes)
- Can be left or removed — no functional impact

---

## 5. Remove Password from Admin User Management

### 5.1 User Creation

**File:** `src/app/api/admin/users/route.ts`

When `authMode === OAUTH_ONLY`:
- Remove `password` from the Zod schema (make it optional or remove entirely)
- Create users with `password: null`
- The user links their OAuth account on first sign-in

When `authMode === OAUTH_AND_CREDENTIALS`:
- Keep current behavior (password required for creation)

Simpler approach: **always make password optional** in the create schema. Admin can create OAuth-only users regardless of authMode. This is already the right thing to do (the Beta Access Gate promote flow creates users without passwords).

```ts
const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100).optional(), // Optional now
  isAdmin: z.boolean().optional(),
});
```

### 5.2 User Creation UI

**File:** `src/components/admin/UserManagementTable.tsx`

When `authMode === OAUTH_ONLY`:
- Hide the password input field in the create user dialog
- Remove password from state (`newUser.password`)
- Update the success toast: "Account created. [Name] can sign in with Google, Apple, GitHub, or Microsoft."

When `authMode === OAUTH_AND_CREDENTIALS`:
- Show password field as optional (not required)

### 5.3 User Edit

**File:** `src/app/api/admin/users/[id]/route.ts`

When `authMode === OAUTH_ONLY`:
- Reject `password` and `removePassword` in PATCH body with a clear error: "Password management is disabled in OAuth-only mode."

**File:** `src/components/admin/UserEditDialog.tsx`

When `authMode === OAUTH_ONLY`:
- Hide the entire password management section (Set Password, Remove Password buttons)
- Show the user's linked OAuth providers instead (Google, Apple, GitHub badges)
- Optionally: show "No OAuth account linked" warning for users who haven't linked yet

### 5.4 User List Display

**File:** `src/app/api/admin/users/route.ts` (GET)

Currently returns `hasPassword` and `hasOAuthAccounts` booleans. Keep both — `hasPassword` helps admin identify users who need to link OAuth before the transition.

Add: `oauthProviders: string[]` — list of linked provider names (e.g., `["google", "github"]`). Useful for the admin to see at a glance which providers each user has.

---

## 6. Credentials-Only User Migration

### 6.1 The Problem

If a user has `password` set but no `Account` records (no OAuth linked), they cannot sign in under `OAUTH_ONLY` mode. They're effectively locked out.

### 6.2 The Solution: Force OAuth Link

When a credentials-only user signs in while `authMode` is still `OAUTH_AND_CREDENTIALS`:

1. After successful password login, check if they have any linked OAuth accounts
2. If not, redirect to a page that prompts them to link an OAuth provider: `/settings/link-oauth`
3. This page shows: "To continue using Tandem, please link a Google, Apple, GitHub, or Microsoft account. Password login is being retired."
4. Once they link at least one OAuth provider, they can proceed normally

This is a soft migration — users are nudged but not blocked (yet). Once all users have OAuth linked, the admin can safely flip to `OAUTH_ONLY`.

### 6.3 Admin Visibility

In the admin user list, show a warning badge next to credentials-only users: "No OAuth — will lose access in OAuth-only mode." This lets the admin proactively reach out to these users.

### 6.4 Hard Cutoff

When the admin flips to `OAUTH_ONLY`:
- Credentials-only users can no longer sign in
- Their accounts still exist (not deleted)
- If they try to sign in via OAuth later and their email matches, the normal OAuth linking logic handles it (Case 2 in the signIn callback: email conflict → error "OAuthAccountNotLinked")

**Wait — this is a problem.** The current Case 2 logic blocks new OAuth logins when the email already exists but has no Account for that provider. This is intentional for security (prevents account takeover via OAuth). But it also blocks legitimate credentials-only users who need to link OAuth.

**Fix:** Add a new case in the signIn callback: if `authMode === OAUTH_ONLY` and the user has no OAuth accounts at all (only a password), auto-link the OAuth account to the existing user. This is safe because:
- The user owns the email (verified by the OAuth provider)
- There's no existing OAuth account to conflict with
- The password-only user had no other way to prove ownership

```ts
// Case 2b: Email exists, no OAuth accounts at all, OAUTH_ONLY mode
// → Auto-link OAuth to existing user (safe migration path)
if (authMode === "OAUTH_ONLY" && existingUser.accounts.length === 0) {
  await prisma.account.create({
    data: {
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
      userId: existingUser.id,
    },
  });
  return true; // Allow sign-in
}
```

This auto-migration only triggers when:
- `authMode` is `OAUTH_ONLY`
- The email matches an existing user
- That user has zero OAuth accounts (pure credentials user)
- An OAuth provider verified the email

---

## 7. Implementation Plan

### Phase 1 — Add GitHub OAuth + Auth Mode Toggle

1. Install `next-auth` GitHub provider (already included in next-auth, just needs config)
2. Add `GitHubProvider` to `src/lib/auth.ts` (conditional on env vars)
3. Add GitHub button to login page
4. Add `AuthMode` enum and `authMode` field to ServerSettings in `prisma/schema.prisma`
5. Add auth mode toggle to admin settings API + UI
6. Add safety check: block `OAUTH_ONLY` if any admin lacks OAuth
7. Run `prisma db push`

**Files:**

| Action | File |
|--------|------|
| MODIFY | `prisma/schema.prisma` |
| MODIFY | `src/lib/auth.ts` |
| MODIFY | `src/app/(auth)/login/page.tsx` |
| MODIFY | `src/app/api/admin/settings/route.ts` |
| MODIFY | `src/components/admin/ServerSettingsForm.tsx` |
| MODIFY | `src/app/api/auth/registration-mode/route.ts` |

**Test:** Sign in with GitHub. Toggle auth mode in admin. Verify credentials form hides/shows.

### Phase 2 — Remove Password from Admin UI

1. Make password optional in user creation schema
2. Hide password input in create dialog when `OAUTH_ONLY`
3. Hide password management in edit dialog when `OAUTH_ONLY`
4. Add OAuth provider badges to user list
5. Add "No OAuth" warning badge for credentials-only users

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/app/api/admin/users/route.ts` |
| MODIFY | `src/app/api/admin/users/[id]/route.ts` |
| MODIFY | `src/components/admin/UserManagementTable.tsx` |
| MODIFY | `src/components/admin/UserEditDialog.tsx` |

**Test:** Create user without password. Edit user — no password options visible. Credentials-only user shows warning.

### Phase 3 — User Migration + Linked Accounts Management

1. Add linked accounts settings page (`/settings/linked-accounts`) — shows linked providers, link new, remove existing
2. Add API endpoints: `GET /api/settings/linked-accounts`, `DELETE /api/settings/linked-accounts/[id]`
3. Add "Link another account" flow — triggers OAuth that links to existing User instead of creating new one
4. Add redirect logic after credentials login: if no OAuth accounts, redirect to linked accounts page
5. Add auto-link logic in signIn callback for `OAUTH_ONLY` mode (Case 2b)
6. Update error messages for better OAuth-only UX

**Files:**

| Action | File |
|--------|------|
| CREATE | `src/app/(dashboard)/settings/linked-accounts/page.tsx` |
| CREATE | `src/app/api/settings/linked-accounts/route.ts` |
| CREATE | `src/app/api/settings/linked-accounts/[id]/route.ts` |
| MODIFY | `src/lib/auth.ts` |
| MODIFY | `src/app/(auth)/login/page.tsx` |

**Test:** Create credentials-only user. Sign in with password → redirected to linked accounts page. Link Google. Link GitHub (now has two providers). Remove Google (allowed — GitHub remains). Try removing GitHub (blocked — last provider). Switch to `OAUTH_ONLY`. Sign in with GitHub → works. Try password login → blocked.

### Phase 4 — Cleanup (Optional, After Full Migration)

Once all users have OAuth accounts and `OAUTH_ONLY` has been active for a while:

1. Remove `CredentialsProvider` import and config entirely
2. Remove `password` field from User model (migration to drop column)
3. Remove bcrypt from auth.ts (keep in oauth.ts)
4. Remove credentials-specific error messages from login page
5. Remove `OAUTH_AND_CREDENTIALS` option from AuthMode enum (hardcode OAuth-only)
6. Remove `/settings/link-oauth` page

This phase is optional and can happen months later. The toggle-based approach means the system works correctly without ever doing this cleanup.

---

## 8. Edge Cases

### No OAuth Providers Configured
If none of `GOOGLE_CLIENT_ID`, `APPLE_ID`, `GITHUB_CLIENT_ID` are set, the login page shows no sign-in options. The admin settings should prevent switching to `OAUTH_ONLY` if no OAuth providers are configured. Check: `providers.length === 0 → reject with "No OAuth providers configured"`.

### User Has Multiple OAuth Providers
Works fine. The signIn callback handles each provider independently. A user can link Google, Apple, and GitHub simultaneously. Any of them works for sign-in.

### OAuth Provider Revoked Access
If a user revokes Tandem's access in their Google/Apple/GitHub/Microsoft settings, the next sign-in attempt fails at the provider level (before reaching Tandem). The user sees a generic OAuth error. They can re-authorize or use a different linked provider.

### Admin Locks Themselves Out
The safety check in Phase 1 prevents this: can't switch to `OAUTH_ONLY` if the current admin (or any admin) has no OAuth accounts. Additionally, the admin can't disable their own account (`isDisabled` self-protection already exists).

### Email Mismatch Between Providers
A user signs up with Google (jason@gmail.com) and later tries GitHub with a different email (jason@github.noreply.com). These create separate accounts. This is the correct behavior — NextAuth matches by `provider + providerAccountId`, not by email across providers.

---

## 9. Open Decisions

### Multi-Provider Linking

Should users be able to link multiple OAuth providers to a single account (e.g., sign up with Google, later add GitHub)?

**Option A — Single provider per account (simpler):**
- The first OAuth provider used to sign in is the only one. To switch, admin must intervene.
- Simpler mental model: "I sign in with Google, period."
- Downside: if a user loses access to that provider, they're locked out.

**Option B — Multiple providers per account (resilient):**
- Users can link additional OAuth providers from a settings page (`/settings/linked-accounts`).
- Any linked provider works for sign-in. Provides redundancy.
- The Account model already supports this — a User can have multiple Account rows with different providers.
- Needs: a UI to view linked providers, a "Link another account" button that triggers OAuth without creating a new User, and a "Remove provider" action (blocked if it's the last one).

**Decision: Option B — multiple providers per account.** The data model already supports it, it's more resilient, and it's what users expect from modern apps. The `/settings/link-oauth` page from Phase 3 (migration) evolves into a permanent linked accounts management page.

**Implementation (add to Phase 3):**
- `/settings/linked-accounts` page showing each linked provider (Google, Apple, GitHub, Microsoft) with provider icon and email
- "Link another account" button triggers OAuth flow that links to the existing User (instead of creating a new one)
- "Remove" button per provider — blocked if it's the last linked provider (must always have at least one)
- API: `GET /api/settings/linked-accounts` returns user's Account records, `DELETE /api/settings/linked-accounts/[id]` removes a link

### Account Switching (Not Implementing)

Account switching (multiple Tandem accounts in one browser session) will not be implemented. Users who need to switch between accounts can use browser profiles or incognito. May revisit if teams/enterprise creates demand.

---

## 10. What This Spec Does Not Cover

- **Social login branding guidelines** — Google/Apple/GitHub/Microsoft have brand guidelines for button styling. The current implementation uses basic buttons. Upgrading to official branded buttons is a polish task.
- **SAML/OIDC enterprise SSO** — for team/enterprise deployments. Separate spec if needed.
- **Passkeys/WebAuthn** — passwordless auth via biometric. A possible future addition but orthogonal to removing traditional passwords.
- **Account linking UI** — a settings page where users can see/manage their linked OAuth providers. Currently no such page exists. Worth adding but not required for this spec.
- **Email verification** — OAuth providers handle email verification. No need for Tandem to verify emails independently.
