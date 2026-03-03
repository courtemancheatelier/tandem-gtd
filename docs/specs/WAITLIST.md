# Waitlist with Admin Email Notification

**Status:** Draft
**Target:** v1.1 (pre-launch gating)
**Depends on:** Nothing — self-contained feature

---

## 1. Why This Exists

Tandem's launch follows a Gmail-style invite rollout: private alpha → closed beta → referral growth → public. During the closed phases, the login page needs to do double duty — let existing users sign in while giving prospective users a way to request access. When someone joins the waitlist, the server admin gets an email so they can review and approve at their own pace.

---

## 2. Registration Modes

Add a `registrationMode` enum to `ServerSettings` that controls what the login page shows:

```
OPEN       → Anyone can create an account (current behavior / post-launch)
WAITLIST   → Login form for existing users + "Join Waitlist" for new visitors
CLOSED     → Login form only, no waitlist, no self-registration
```

Default for new installations: `WAITLIST`

The admin toggles this from **Admin → Server Settings**. The existing `ServerSettingsForm` gets a new "Registration Mode" section at the top.

---

## 3. Data Model

### 3.1 WaitlistEntry

```prisma
model WaitlistEntry {
  id        String          @id @default(cuid())
  email     String          @unique
  name      String
  status    WaitlistStatus  @default(PENDING)
  notes     String?         // Admin-only notes (e.g. "Jason's twin brother")
  createdAt DateTime        @default(now()) @map("created_at")
  updatedAt DateTime        @updatedAt @map("updated_at")
  
  @@index([status])
  @@map("waitlist_entries")
}

enum WaitlistStatus {
  PENDING    // Submitted, awaiting review
  APPROVED   // Admin approved — invite email sent
  DECLINED   // Admin declined
}
```

### 3.2 ServerSettings Additions

```prisma
// Add to existing ServerSettings model:
registrationMode  RegistrationMode  @default(WAITLIST) @map("registration_mode")

// SMTP config for outbound email (waitlist notifications + future use)
smtpHost          String?           @map("smtp_host")
smtpPort          Int?              @map("smtp_port")
smtpUser          String?           @map("smtp_user")
smtpPass          String?           @map("smtp_pass")     // Encrypted same as API key
smtpFrom          String?           @map("smtp_from")     // "Tandem <noreply@example.com>"
smtpSecure        Boolean           @default(true) @map("smtp_secure")  // TLS

enum RegistrationMode {
  OPEN
  WAITLIST
  CLOSED
}
```

**Why store SMTP in the database?** Self-hosters configure everything through the admin UI — no env var wrangling. The SMTP password gets encrypted with the same `encrypt()` function used for the Anthropic API key. Env var overrides (`SMTP_HOST`, `SMTP_PORT`, etc.) are also supported for Docker deployments where config-as-env is preferred.

---

## 4. Login Page Changes

The login page at `src/app/(auth)/login/page.tsx` needs to know the current registration mode. Fetch it from a new public endpoint on mount.

### 4.1 Auth Strategy: OAuth-First

Tandem is moving to OAuth-only authentication. The login page leads with Google/Apple sign-in buttons. The email/password form is retained **only** as a legacy fallback for users who created accounts before OAuth was available, and is visually de-emphasized.

The `GET /api/registration-mode` endpoint returns both the registration mode and which OAuth providers are configured, so the login page can render appropriately.

### 4.2 Layout When `registrationMode === "WAITLIST"`

```
┌─────────────────────────────────────┐
│           Tandem GTD                │
│     Sign in to your account         │
│                                     │
│  [Continue with Google]             │
│  [Continue with Apple]              │
│                                     │
│  ▸ Sign in with email & password    │
│    (collapsed — expands on click)   │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Don't have an account yet?         │
│                                     │
│  Name:  [________________]          │
│  Email: [________________]          │
│  [    Join the Waitlist    ]        │
│                                     │
│  ✓ You're on the list! We'll be     │
│    in touch when a spot opens up.   │
└─────────────────────────────────────┘
```

Key behaviors:
- OAuth buttons are **primary** — large, prominent, at the top
- Email/password is collapsed behind a "Sign in with email & password" disclosure. This keeps it accessible for legacy users without cluttering the default view. When no OAuth providers are configured (self-hosters who haven't set up Google/Apple yet), the email/password form shows expanded as the primary option.
- The waitlist section appears **below** the sign-in section, separated by a divider
- After successful submission, the form is replaced with a confirmation message (no page redirect)
- If the email is already on the waitlist, show: "You're already on the list — we'll be in touch!"
- If the email belongs to an existing user, show: "This email already has an account. Try signing in above."
- The waitlist form is a simple two-field form — no CAPTCHA needed for alpha/beta scale

### 4.3 Layout When `registrationMode === "OPEN"`

OAuth buttons + collapsed email/password fallback. No waitlist section. For now, `OPEN` mode behaves identically to current behavior — admin creates accounts manually or via invite. Future: self-registration via OAuth directly.

### 4.4 Layout When `registrationMode === "CLOSED"`

OAuth buttons + collapsed email/password fallback. No waitlist, no registration messaging. Clean and minimal.

---

## 5. API Surface

### 5.1 Public Endpoints (No Auth Required)

```
GET  /api/registration-mode
  → { mode: "OPEN" | "WAITLIST" | "CLOSED" }
  Purpose: Login page checks this on mount to decide what UI to render.
  No sensitive data exposed — just the mode string.

POST /api/waitlist
  Body: { name: string, email: string }
  → 201: { message: "You're on the list!" }
  → 409: { message: "Already on the waitlist" }
  → 409: { message: "Account already exists" }
  → 400: { message: "Waitlist is not currently open" }
  → 400: Validation errors (missing/invalid email or name)
  
  Side effects:
    1. Creates WaitlistEntry with status PENDING
    2. Sends admin notification email (see §6)
    3. Rate limited: 5 requests per IP per hour
```

### 5.2 Admin Endpoints (Require `isAdmin`)

```
GET    /api/admin/waitlist
  Query: ?status=PENDING (default) | APPROVED | DECLINED | all
  → Array of WaitlistEntry objects, ordered by createdAt desc

PATCH  /api/admin/waitlist/:id
  Body: { status: "APPROVED" | "DECLINED", notes?: string }
  → Updated WaitlistEntry
  
  Side effects when status → APPROVED:
    1. Create a new User record (password = null — OAuth-only)
    2. Check if OAuth providers are configured on this server:
       a. OAuth available → send welcome email directing user to sign in via Google/Apple
       b. No OAuth → generate PasswordSetupToken, send email with setup link
    3. Mark entry as APPROVED
  
  Side effects when status → DECLINED:
    1. Mark entry as DECLINED
    2. No email sent (silent decline — no need to notify rejected users)

DELETE /api/admin/waitlist/:id
  → 204 (permanently remove an entry — e.g. spam cleanup)
```

### 5.3 Admin Settings Extension

The existing `PATCH /api/admin/settings` endpoint accepts these new fields:

```
registrationMode: "OPEN" | "WAITLIST" | "CLOSED"
smtpHost: string | null
smtpPort: number | null
smtpUser: string | null
smtpPass: string | null    // Encrypted on save, masked on GET (same as API key)
smtpFrom: string | null
smtpSecure: boolean
```

Add a **"Send Test Email"** button in the admin UI that fires:

```
POST /api/admin/email-test
  → Sends a test email to the admin's own email address
  → 200: { message: "Test email sent" }
  → 500: { message: "SMTP configuration error", details: "..." }
```

---

## 6. Admin Notification Email

When a new waitlist entry is created, send an email to every user where `isAdmin === true`.

### 6.1 Email Content

```
Subject: 🆕 New Tandem waitlist signup: {name}

Hey —

Someone just joined the Tandem waitlist:

  Name:  {name}
  Email: {email}
  Time:  {createdAt, formatted}

Review and approve/decline from your admin panel:
  {serverUrl}/settings/admin/waitlist

— Tandem
```

Plain text only — no HTML templates needed at this scale. Keep it simple and scannable.

### 6.2 Email Service Implementation

Create `src/lib/email.ts`:

```typescript
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/ai/crypto";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
}

/**
 * Resolves SMTP config with env var overrides taking precedence.
 * Returns null if SMTP is not configured.
 */
async function getSmtpConfig() {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
  });

  const host = process.env.SMTP_HOST || settings?.smtpHost;
  const port = process.env.SMTP_PORT 
    ? parseInt(process.env.SMTP_PORT) 
    : settings?.smtpPort;
  const user = process.env.SMTP_USER || settings?.smtpUser;
  const pass = process.env.SMTP_PASS 
    || (settings?.smtpPass ? decrypt(settings.smtpPass) : null);
  const from = process.env.SMTP_FROM || settings?.smtpFrom;
  const secure = process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === "true"
    : (settings?.smtpSecure ?? true);

  if (!host || !port || !from) return null;

  return { host, port, user, pass, from, secure };
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const config = await getSmtpConfig();
  
  if (!config) {
    console.warn("[email] SMTP not configured — skipping email:", options.subject);
    return; // Fail silently — admin can configure later
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}

/**
 * Notify all admins about a new waitlist signup.
 */
export async function notifyAdminsOfWaitlistSignup(
  entry: { name: string; email: string; createdAt: Date }
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true },
  });

  const serverUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const formattedTime = entry.createdAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const text = [
    `Hey —\n`,
    `Someone just joined the Tandem waitlist:\n`,
    `  Name:  ${entry.name}`,
    `  Email: ${entry.email}`,
    `  Time:  ${formattedTime}\n`,
    `Review and approve/decline from your admin panel:`,
    `  ${serverUrl}/settings/admin/waitlist\n`,
    `— Tandem`,
  ].join("\n");

  const subject = `🆕 New Tandem waitlist signup: ${entry.name}`;

  // Send to all admins in parallel, don't let one failure block others
  await Promise.allSettled(
    admins.map((admin) => sendEmail({ to: admin.email, subject, text }))
  );
}
```

### 6.3 Graceful Degradation

If SMTP is not configured, `sendEmail` logs a warning and returns without throwing. The waitlist entry is still created successfully — the admin just won't get notified by email and will need to check the admin panel manually. This prevents SMTP misconfiguration from blocking the waitlist entirely.

---

## 7. Admin Panel — Waitlist Management

### 7.1 New Admin Page: `/settings/admin/waitlist`

Add a nav link in the admin sidebar: **"Waitlist"** with a badge showing the pending count.

```
┌──────────────────────────────────────────────────────────┐
│  Waitlist                                    3 pending   │
│                                                          │
│  ┌─ Filter ────────────────────────────────────────┐     │
│  │ [Pending (3)] [Approved (12)] [Declined (1)]    │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Sarah Chen                              2 hours ago │ │
│  │ sarah@example.com                                   │ │
│  │ Notes: [________________________]                   │ │
│  │                    [Approve ✓]  [Decline ✗]         │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │ Mike Johnson                            5 hours ago │ │
│  │ mike@example.com                                    │ │
│  │ Notes: [________________________]                   │ │
│  │                    [Approve ✓]  [Decline ✗]         │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │ Alex Rivera                                 1d ago  │ │
│  │ alex@example.com                                    │ │
│  │ Notes: [________________________]                   │ │
│  │                    [Approve ✓]  [Decline ✗]         │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Key behaviors:
- **Approve** creates the user account and sends a welcome email with password setup link
- **Decline** silently marks the entry — no email to the applicant
- **Notes** field lets the admin jot context ("Jason's friend", "from HN thread")
- Filter tabs show count badges
- Cards show relative timestamps ("2 hours ago", "3 days ago")
- Approved entries show "Account created ✓" badge instead of action buttons

### 7.2 Registration Mode in Server Settings

Add to the existing `ServerSettingsForm` component, above the AI section:

```
┌──────────────────────────────────────────────────────────┐
│  🚪 Registration                                         │
│                                                          │
│  Registration Mode                                       │
│  ┌─────────────────────────────────────┐                 │
│  │ [▾ Waitlist                       ] │                 │
│  └─────────────────────────────────────┘                 │
│  Controls who can create accounts on this server.        │
│  • Open — anyone can register                            │
│  • Waitlist — visitors request access, admin approves    │
│  • Closed — admin creates all accounts manually          │
│                                                          │
│  ── SMTP Configuration ────────────────────────────────  │
│                                                          │
│  SMTP Host:     [smtp.gmail.com_________]                │
│  SMTP Port:     [587___]                                 │
│  SMTP User:     [you@gmail.com__________]                │
│  SMTP Password: [••••••••] (encrypted)                   │
│  From Address:  [Tandem <noreply@...>___]                │
│  TLS:           [✓ on]                                   │
│                                                          │
│  [Send Test Email]   [Save SMTP Settings]                │
│                                                          │
│  ℹ️ SMTP is required for waitlist notifications and      │
│    account invitation emails. Can also be configured     │
│    via SMTP_HOST, SMTP_PORT, etc. environment variables. │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Approval → Account Creation Flow

When the admin clicks **Approve**:

```
Admin clicks [Approve ✓]
  → PATCH /api/admin/waitlist/:id  { status: "APPROVED" }
  → Server creates User record:
      email: entry.email
      name: entry.name
      password: null          ← OAuth-only, no password
      isAdmin: false
  → Server sends welcome email:
  
      Subject: Welcome to Tandem! Your account is ready
      
      Hey {name} —
      
      You've been approved for Tandem! Sign in with Google or Apple
      using this email address ({email}):
      
        {serverUrl}/login
      
      — Tandem

  → Entry status updated to APPROVED
  → Admin UI shows "Account created ✓" on the card
```

### 8.1 How Sign-In Works for Approved Users

This leverages the existing OAuth auto-link logic in `src/lib/auth.ts`:

1. Admin approves → User record created with `password: null` and the waitlist email
2. User clicks the link in their welcome email → arrives at `/login`
3. User clicks "Continue with Google" (or Apple)
4. The `signIn` callback hits **Case 2** ("Existing email, new OAuth provider — auto-link"):
   - Finds the User record by email
   - Creates an Account record linking the OAuth provider
   - Signs them in
5. User lands on `/do-now` — fully set up, no extra steps

**No password setup page, no tokens, no reset flow.** The pre-created User record with matching email is all that's needed for the OAuth auto-link to work seamlessly.

### 8.2 Legacy Password Fallback

For self-hosted instances where OAuth isn't configured (no Google/Apple client IDs), the approval flow needs a way for users to set a password. In this case:

- The welcome email includes a one-time setup link: `{serverUrl}/setup-password?token={token}`
- A `PasswordSetupToken` is generated (crypto.randomBytes, 7-day expiry, single-use)
- The `/setup-password` page lets them set email + password
- **This path is only used when zero OAuth providers are configured** on the server

```prisma
// Only needed for non-OAuth servers
model PasswordSetupToken {
  id        String    @id @default(cuid())
  userId    String    @unique @map("user_id")
  user      User      @relation(fields: [userId], references: [id])
  token     String    @unique   // crypto.randomBytes(32).toString("hex")
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  
  createdAt DateTime  @default(now()) @map("created_at")
  
  @@map("password_setup_tokens")
}
```

The approval endpoint checks whether OAuth providers are configured:
- **OAuth available:** Create User, send "sign in with Google/Apple" email, done
- **No OAuth:** Create User, generate PasswordSetupToken, send "set your password" email

This keeps the OAuth-first path clean while ensuring self-hosters without OAuth aren't locked out.

---

## 9. Rate Limiting

The `POST /api/waitlist` endpoint needs basic rate limiting to prevent abuse:
- **5 submissions per IP per hour** (generous for legitimate use, blocks spam)
- Implementation: Use an in-memory map with IP → timestamp array, cleaned up on interval
- For production with multiple app servers: move to Redis or database-backed rate limiting (future)
- Return `429 Too Many Requests` with `Retry-After` header when exceeded

---

## 10. Dependencies

```
npm install nodemailer
npm install -D @types/nodemailer
```

No other new dependencies. Uses existing:
- Prisma (data model)
- `encrypt()`/`decrypt()` from `src/lib/ai/crypto.ts` (SMTP password storage)
- `crypto.randomBytes` from Node.js (password setup tokens)

---

## 11. Environment Variable Overrides

For Docker / infrastructure-as-code deployments, SMTP can be configured entirely via env vars. These take precedence over database values:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-specific-password
SMTP_FROM="Tandem <noreply@yourdomain.com>"
SMTP_SECURE=true
```

When env vars are present, the admin UI SMTP section shows: "SMTP configured via environment variables" with the values displayed read-only (password masked).

---

## 12. Migration

```sql
-- Add registration mode to server_settings
ALTER TABLE server_settings 
  ADD COLUMN registration_mode TEXT NOT NULL DEFAULT 'WAITLIST';

-- Add SMTP fields to server_settings
ALTER TABLE server_settings
  ADD COLUMN smtp_host TEXT,
  ADD COLUMN smtp_port INTEGER,
  ADD COLUMN smtp_user TEXT,
  ADD COLUMN smtp_pass TEXT,
  ADD COLUMN smtp_from TEXT,
  ADD COLUMN smtp_secure BOOLEAN NOT NULL DEFAULT true;

-- Create waitlist table
CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_waitlist_status ON waitlist_entries(status);

-- Create password setup tokens table (for non-OAuth servers only)
CREATE TABLE password_setup_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Prisma handles this via `npx prisma migrate dev` — the SQL above is for reference. The `password_setup_tokens` table is always created but only populated when no OAuth providers are configured on the server.

---

## 13. File Manifest

```
New files:
  prisma/migrations/XXXX_waitlist/migration.sql
  src/lib/email.ts                              — nodemailer wrapper + admin notification
  src/app/api/registration-mode/route.ts        — GET public endpoint
  src/app/api/waitlist/route.ts                 — POST public endpoint
  src/app/api/admin/waitlist/route.ts           — GET list
  src/app/api/admin/waitlist/[id]/route.ts      — PATCH approve/decline, DELETE
  src/app/api/admin/email-test/route.ts         — POST test email
  src/app/(auth)/setup-password/page.tsx        — Password setup (non-OAuth servers only)
  src/app/(dashboard)/settings/admin/waitlist/page.tsx  — Admin waitlist management
  src/components/admin/WaitlistCard.tsx          — Individual entry card
  src/components/admin/SmtpSettingsForm.tsx      — SMTP config section
  src/components/auth/WaitlistForm.tsx           — Join waitlist form for login page

Modified files:
  prisma/schema.prisma                          — New models + enums
  src/app/(auth)/login/page.tsx                 — OAuth-first layout + conditional waitlist
                                                  section + collapsed password fallback
  src/app/api/admin/settings/route.ts           — New fields in GET/PATCH
  src/components/admin/ServerSettingsForm.tsx    — Registration mode selector
  src/components/layout/nav.tsx                 — Admin waitlist nav link with badge
  prisma/seed.ts                                — Set registrationMode in seed data
```

---

## 14. Seed Data Updates

Update the existing seed to set registration mode and optionally seed sample waitlist entries for demo:

```typescript
// In server settings upsert:
registrationMode: "WAITLIST",

// Sample waitlist entries (for demo/dev only):
const waitlistDefs = [
  { name: "Sarah Chen", email: "sarah@example.com", status: "PENDING" },
  { name: "Mike Johnson", email: "mike@example.com", status: "PENDING" },
  { name: "Alex Rivera", email: "alex@example.com", status: "APPROVED" },
];
```

---

## 15. Security Considerations

- **OAuth-first reduces attack surface:** No passwords to brute-force or phish for new users. The only credential exchange happens between the user's browser and Google/Apple, never touching Tandem's server.
- **Legacy password login:** Retained for pre-OAuth users. The email/password form is collapsed by default to discourage new usage. Existing users with passwords can continue using them indefinitely — no forced migration, but OAuth linking is encouraged.
- **SMTP password:** Encrypted at rest using the same AES scheme as the Anthropic API key
- **Password setup tokens (non-OAuth only):** 64-character hex (32 random bytes), 7-day expiry, single-use. Only generated when the server has zero OAuth providers configured.
- **Rate limiting:** IP-based on the public waitlist endpoint to prevent enumeration
- **Email enumeration:** The waitlist endpoint returns the same 201 status for "already on waitlist" to prevent email discovery. The differentiated messages are shown client-side based on the response message field, but an attacker can't distinguish "new signup" from "already exists" by status code alone — wait, actually the 409 does leak this. **Decision:** Return 201 for all successful-looking requests. Use a generic message. The detailed feedback ("already on the list" vs "account exists") is a UX nicety that's worth the minor enumeration risk at this scale. Revisit if the server goes public.
- **No waitlist data in public API:** The `GET /api/admin/waitlist` endpoint requires admin auth. No public endpoint lists waitlist entries.
- **OAuth auto-link safety:** The existing `signIn` callback in `auth.ts` links OAuth accounts to Users by email match. This is safe because: (a) Google/Apple verify email ownership, and (b) the admin pre-approved this specific email via the waitlist. A bad actor can't claim someone else's email through OAuth.
