# Beta Access Gate — Invite-Only Signup with Waitlist

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Anyone with a Google account can sign into the Tandem beta and immediately get a full account. The `signIn` callback in `auth.ts` auto-creates a User + Account + 7 default GTD contexts on first OAuth login. There is no approval step, no invite code, no waitlist. This means:

- Random people can discover the beta URL and create accounts with full access
- There's no way to control who gets in during the beta period
- No mechanism to collect interest from people who want access but aren't invited yet
- No way to know who tried to sign up so they can be invited later

### What We Want

A gated beta flow:

1. **Visitor arrives** → sees a "Beta — Coming Soon" landing page with a clear message that Tandem is in private beta
2. **Visitor clicks "Join Waitlist" (Google OAuth)** → Google OAuth captures their name and email, stores it as a waitlist entry. They do NOT get an account. They see a "You're on the list" confirmation page.
3. **Admin reviews waitlist** → Jason sees waitlist entries in the admin panel with name, email, signup date
4. **Admin approves a person** → creates a real User account (with or without linking their existing OAuth info). The approved person is notified (future: email, for now: manual reach-out)
5. **Approved person signs in** → Google OAuth finds their existing account and lets them in. Normal app experience.

### What "Done" Looks Like

- Unauthenticated visitors cannot access the app — they see the landing/waitlist page
- Google OAuth on the landing page captures name + email into a waitlist table, NOT the User table
- Waitlist entries are visible in the admin panel
- Admin can promote a waitlist entry to a real user account (one-click)
- Existing users (Jason, anyone already created via admin) are unaffected — their OAuth still works
- The gate can be turned off later when Tandem goes public (server setting toggle)

### Design Constraints

- Must work with existing NextAuth.js Google + Apple OAuth providers
- Must not break existing admin-created accounts
- Must not break the credentials (email/password) login path
- Reuse existing admin UI patterns (tables, dialogs, settings toggles)
- The `signIn` callback in `auth.ts` is the control point — it decides whether to create a user or redirect to waitlist

---

## 2. Data Model

### 2.1 New Model: WaitlistEntry

```prisma
model WaitlistEntry {
  id                String   @id @default(cuid())
  email             String   @unique
  name              String
  provider          String   // "google", "apple"
  providerAccountId String   // Provider's unique user ID (for linking later)
  status            WaitlistStatus @default(PENDING)
  promotedUserId    String?  // Set when promoted to a real user
  promotedUser      User?    @relation(fields: [promotedUserId], references: [id])
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([provider, providerAccountId])
}

enum WaitlistStatus {
  PENDING    // Signed up, waiting for approval
  PROMOTED   // Admin created their account — they can now log in
  DECLINED   // Admin explicitly declined (optional, for tracking)
}
```

This captures everything needed to:
- Show the admin who's waiting (name, email, when they signed up)
- Prevent duplicate waitlist entries (unique on email and provider+providerAccountId)
- Promote to a real user later (store providerAccountId so the OAuth Account can be linked without re-auth)
- Track the outcome (promoted vs declined vs still waiting)

### 2.2 New Fields on ServerSettings

```prisma
// Add to existing ServerSettings model:
registrationMode  RegistrationMode @default(WAITLIST)

enum RegistrationMode {
  WAITLIST  // OAuth signup goes to waitlist (beta mode)
  OPEN      // OAuth signup auto-creates accounts (current behavior, for public launch)
}
```

This is the kill switch. When Tandem goes public, flip `registrationMode` to `OPEN` and the current auto-create behavior returns. No code removal needed.

### 2.3 User Model — Add Waitlist Relation

```prisma
// Add to existing User model:
waitlistEntry     WaitlistEntry?
```

This backlink lets the admin see which users came from the waitlist vs were manually created.

---

## 3. Auth Flow Changes

### 3.1 Modified signIn Callback (`src/lib/auth.ts`)

The `signIn` callback currently has 3 cases for OAuth:
1. **Returning user** — Account exists → update tokens → allow
2. **Email conflict** — email exists but no Account → block (OAuthAccountNotLinked)
3. **Brand new user** — no Account, no email → auto-create User + Account + contexts → allow

The change: **Case 3 now checks `registrationMode`**.

```
Case 3 (brand new OAuth user):
  if registrationMode === WAITLIST:
    → upsert WaitlistEntry (email, name, provider, providerAccountId)
    → return "/waitlist/confirmed" (redirect, do NOT create User)
  if registrationMode === OPEN:
    → auto-create User + Account + contexts (current behavior)
    → allow sign-in
```

The upsert on WaitlistEntry handles repeat visits — if someone clicks "Join Waitlist" twice, their entry updates rather than erroring.

### 3.2 Promoted User Sign-In

When an admin promotes a waitlist entry, it creates a User + Account using the stored `provider` and `providerAccountId`. The next time that person signs in with Google:

1. `signIn` callback finds the Account by `provider + providerAccountId` → **Case 1 (returning user)**
2. Updates tokens, allows sign-in
3. They're in — normal app experience

No special "first login after promotion" flow needed. The Account already exists from the promotion step.

### 3.3 Credentials Login Unaffected

The credentials provider uses `authorize()` which looks up the User by email + bcrypt password. It doesn't touch the waitlist at all. Admin-created users with passwords work exactly as before.

---

## 4. Pages & UI

### 4.1 Landing Page (Unauthenticated)

**File:** `src/app/(auth)/login/page.tsx` (modify existing)

When `registrationMode === WAITLIST`, the login page shows two distinct sections:

```
┌─────────────────────────────────────┐
│                                     │
│          Tandem                     │
│    GTD Done Right                   │
│                                     │
│  Tandem is in private beta.         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Already have an account?   │    │
│  │                             │    │
│  │  [Sign in with Google]      │    │
│  │  [Sign in with Apple]       │    │
│  │  ── or ──                   │    │
│  │  Email: [___________]       │    │
│  │  Password: [________]       │    │
│  │  [Sign In]                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Don't have an account?     │    │
│  │                             │    │
│  │  Join the waitlist to get   │    │
│  │  early access.              │    │
│  │                             │    │
│  │  [Join Waitlist with Google] │   │
│  │  [Join Waitlist with Apple]  │   │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

**How it works:**

Both "Sign in with Google" and "Join Waitlist with Google" trigger the same Google OAuth flow. The difference is a query parameter:

- Sign in: `signIn("google")` — standard NextAuth flow
- Join waitlist: `signIn("google", { callbackUrl: "/waitlist/confirmed" })` with a flag

To distinguish the two intents in the `signIn` callback, pass a custom parameter via the OAuth state:

```tsx
// Sign in button (existing users)
signIn("google", { callbackUrl: "/do-now" })

// Waitlist button (new users)
signIn("google", { callbackUrl: "/waitlist/confirmed", intent: "waitlist" })
```

However, NextAuth doesn't natively pass custom params through OAuth. Simpler approach:

**The `signIn` callback doesn't need to know the intent.** It just checks: does this OAuth user already have an Account?
- Yes → sign them in (returning user)
- No → check `registrationMode`:
  - `WAITLIST` → create WaitlistEntry, redirect to `/waitlist/confirmed`
  - `OPEN` → create User (current behavior)

Both buttons trigger the same OAuth flow. The callback handles the routing. The "Sign in" button is for existing users who already have accounts — if a new user clicks it, they still end up on the waitlist. The two-button UI is just clearer messaging.

When `registrationMode === OPEN`, the login page shows the current layout (no waitlist section).

### 4.2 Waitlist Confirmation Page

**New file:** `src/app/(auth)/waitlist/confirmed/page.tsx`

```
┌─────────────────────────────────────┐
│                                     │
│          ✓ You're on the list!      │
│                                     │
│  Thanks, [Name]. We've recorded     │
│  your interest in Tandem.           │
│                                     │
│  We're rolling out access in small  │
│  batches. You'll hear from us when  │
│  your account is ready.             │
│                                     │
│  [← Back to login]                  │
│                                     │
└─────────────────────────────────────┘
```

This page is static — no auth required. The name can be passed via a query parameter from the signIn redirect, or the page can just show a generic message without the name.

### 4.3 Admin Waitlist Management

**New file:** `src/app/api/admin/waitlist/route.ts`

```
GET  /api/admin/waitlist         → list all waitlist entries (filterable by status)
POST /api/admin/waitlist/promote → promote entry to real user
POST /api/admin/waitlist/decline → mark entry as declined
```

**Promote flow:**
1. Admin clicks "Approve" on a waitlist entry
2. API creates a User (name, email from waitlist entry, no password)
3. API creates an Account (provider, providerAccountId from waitlist entry, no tokens — tokens populate on next OAuth sign-in)
4. API seeds 7 default GTD contexts for the new user
5. API updates WaitlistEntry status to `PROMOTED`, sets `promotedUserId`
6. Returns the new User

**Admin UI:**

Add a "Waitlist" tab or section to the existing admin settings page (`src/app/(dashboard)/settings/admin/page.tsx`).

**New component:** `src/components/admin/WaitlistTable.tsx`

```
┌──────────────────────────────────────────────────────┐
│ Waitlist (3 pending)                                 │
├──────────┬─────────────────────┬──────────┬──────────┤
│ Name     │ Email               │ Signed Up│ Actions  │
├──────────┼─────────────────────┼──────────┼──────────┤
│ Jane Doe │ jane@example.com    │ Feb 23   │ [✓] [✗]  │
│ Bob Smith│ bob@example.com     │ Feb 22   │ [✓] [✗]  │
│ Alex Lee │ alex@example.com    │ Feb 21   │ [✓] [✗]  │
└──────────┴─────────────────────┴──────────┴──────────┘

[✓] = Approve (promotes to user)
[✗] = Decline (marks as declined, does not delete)
```

Show promoted/declined entries in a collapsed section below (like the Projects page pattern with Completed/Dropped).

### 4.4 Registration Mode Toggle

Add to the existing `ServerSettingsForm.tsx`:

```
Registration
  ┌─ ○ Waitlist mode (private beta) ─────────────────┐
  │  New OAuth signups go to the waitlist.            │
  │  Only admin-created accounts can sign in.         │
  └───────────────────────────────────────────────────┘
  ┌─ ○ Open registration ────────────────────────────┐
  │  New OAuth signups create accounts automatically. │
  │  Anyone with Google/Apple can sign in.            │
  └───────────────────────────────────────────────────┘
```

This is a radio group (only one active), not a toggle. Maps to `ServerSettings.registrationMode`.

---

## 5. Implementation Plan

### Phase 1 — Data Model + Auth Gate

1. Add `WaitlistEntry` model, `WaitlistStatus` enum, and `RegistrationMode` enum to `prisma/schema.prisma`
2. Add `registrationMode` field to `ServerSettings` model (default: `WAITLIST`)
3. Add `waitlistEntry` relation to `User` model
4. Run `prisma db push`
5. Modify `signIn` callback in `src/lib/auth.ts`:
   - Fetch `registrationMode` from ServerSettings
   - In Case 3 (new OAuth user): if `WAITLIST`, upsert WaitlistEntry and redirect to `/waitlist/confirmed`
   - If `OPEN`, keep current auto-create behavior
6. Create `/waitlist/confirmed` page

**Files:**
| Action | File |
|--------|------|
| MODIFY | `prisma/schema.prisma` |
| MODIFY | `src/lib/auth.ts` |
| CREATE | `src/app/(auth)/waitlist/confirmed/page.tsx` |

**Test:** Sign in with a new Google account → should land on waitlist confirmation, NOT the app. Sign in with existing account → should work normally.

### Phase 2 — Admin Waitlist UI

1. Create waitlist API endpoints (`GET /api/admin/waitlist`, `POST /api/admin/waitlist/promote`, `POST /api/admin/waitlist/decline`)
2. Create `WaitlistTable` component
3. Add waitlist section to admin settings page
4. Implement promote flow (create User + Account + contexts, update WaitlistEntry)

**Files:**
| Action | File |
|--------|------|
| CREATE | `src/app/api/admin/waitlist/route.ts` |
| CREATE | `src/app/api/admin/waitlist/promote/route.ts` |
| CREATE | `src/app/api/admin/waitlist/decline/route.ts` |
| CREATE | `src/components/admin/WaitlistTable.tsx` |
| MODIFY | `src/app/(dashboard)/settings/admin/page.tsx` |

**Test:** New Google OAuth user lands on waitlist → admin sees entry → admin clicks Approve → entry promoted → user signs in with Google → lands in the app.

### Phase 3 — Login Page + Registration Mode Toggle

1. Update login page to show waitlist section when `registrationMode === WAITLIST`
2. Add `registrationMode` to admin settings API (`GET` defaults, `PATCH` allowedFields)
3. Add registration mode radio group to `ServerSettingsForm`
4. Fetch `registrationMode` on the login page (new public API endpoint or pass via server component)

**Files:**
| Action | File |
|--------|------|
| MODIFY | `src/app/(auth)/login/page.tsx` |
| MODIFY | `src/app/api/admin/settings/route.ts` |
| MODIFY | `src/components/admin/ServerSettingsForm.tsx` |
| CREATE | `src/app/api/auth/registration-mode/route.ts` (public, returns mode only) |

**Test:** Toggle registration mode in admin → login page updates. Switch to OPEN → new OAuth users auto-create accounts (original behavior).

---

## 6. Edge Cases

### Repeat Waitlist Signup
A person clicks "Join Waitlist" multiple times. The `upsert` on `email` (or `provider + providerAccountId`) updates the existing entry rather than creating duplicates. They see the confirmation page each time.

### Waitlist User Tries "Sign In" Button
If someone on the waitlist clicks the "Sign in" button instead of "Join Waitlist," the same OAuth flow triggers. The `signIn` callback sees no existing Account, checks registration mode, and redirects to waitlist. The buttons are just messaging — the backend behavior is the same.

### Admin Creates User Manually (Not From Waitlist)
The existing `POST /api/admin/users` still works. Admin can create a user with email + password directly, bypassing the waitlist entirely. If that email has a waitlist entry, it stays as `PENDING` (no automatic linking). Admin can clean it up manually or we auto-mark it as `PROMOTED` when the email matches.

### Promoted User Never Signs In
The Account created during promotion has no tokens (just `provider` and `providerAccountId`). When they eventually sign in, the `signIn` callback finds the Account (Case 1) and populates the tokens. No issue.

### Switch From WAITLIST to OPEN Mode
Any `PENDING` waitlist entries remain in the table but are now irrelevant — new signups auto-create accounts. The admin can still promote/decline old entries. No data migration needed.

### Switch From OPEN Back to WAITLIST
New signups start going to the waitlist again. Users who already have accounts are unaffected. Clean transition.

### Apple OAuth
Same flow as Google. The `signIn` callback handles all OAuth providers uniformly. Waitlist entries store the provider name so the admin can see which provider was used.

---

## 7. What This Spec Does Not Cover

- **Email notifications** — when a waitlist entry is promoted, the admin manually reaches out. Automated email (SendGrid, Resend, etc.) is a separate concern.
- **Invite codes** — a code-based invite system (admin generates a code, user enters it at signup) is an alternative to the waitlist. Could be added later as a third `RegistrationMode` option (`INVITE_CODE`).
- **Self-serve waitlist status check** — the waitlist confirmation page is fire-and-forget. There's no "check your status" page. This keeps things simple for beta.
- **Rate limiting** on waitlist signups — not needed for beta scale. If Tandem goes viral, add rate limiting to the signIn callback.
- **Waitlist position / queue** — entries are shown to admin in signup order. There's no public "you're #47 in line" display.
