# Invite-Based Growth System

**Status:** Draft  
**Scope:** User registration, invite codes, growth phases, referral tracking

---

## 1. Overview

Tandem grows through controlled phases that give the operator visibility into user acquisition, server load, and community quality. Each phase uses a different registration mechanism, and every user carries a `tier` tag that records _how_ they got in.

```
Phase 1 — Private Alpha    Admin manually approves waitlist → tier: ALPHA
Phase 2 — Closed Beta      Alpha users share 2 invite codes → tier: BETA
Phase 3 — Expanded Beta    Beta users get 2 more codes      → tier: BETA
Phase 4 — Public Launch    Open registration                → tier: GENERAL
```

The operator controls phase transitions — there's no automatic escalation. You decide when to hand out the next round of codes based on server capacity and support bandwidth.

---

## 2. Schema Changes

### 2.1 User Model Additions

```prisma
enum UserTier {
  WAITLIST      // Signed up, not yet approved
  ALPHA         // Admin-approved from waitlist
  BETA          // Joined via invite code from alpha/beta user
  GENERAL       // Joined after public open
}

model User {
  // ... existing fields ...

  tier          UserTier  @default(WAITLIST)
  invitedById   String?   @map("invited_by_id")
  invitedBy     User?     @relation("UserInvites", fields: [invitedById], references: [id])
  invitees      User[]    @relation("UserInvites")

  inviteCodes   InviteCode[]  // Codes this user can distribute

  @@index([tier])
  @@index([invitedById])
}
```

### 2.2 New InviteCode Model

```prisma
model InviteCode {
  id          String    @id @default(cuid())
  code        String    @unique           // 8-char alphanumeric, e.g. "TND-A3F8"
  createdById String    @map("created_by_id")
  createdBy   User      @relation(fields: [createdById], references: [id])
  usedById    String?   @unique @map("used_by_id")  // null = unclaimed
  usedAt      DateTime?
  expiresAt   DateTime?                   // Optional expiry
  tier        UserTier  @default(BETA)    // Tier granted to the person who uses it
  createdAt   DateTime  @default(now())

  @@index([code])
  @@index([createdById])
}
```

### 2.3 Domain Whitelist

```prisma
model AllowedDomain {
  id        String   @id @default(cuid())
  domain    String   @unique          // e.g. "ketiv.com"
  tier      UserTier @default(BETA)   // Tier granted to users from this domain
  note      String?                   // Admin note: "KETIV coworkers"
  createdAt DateTime @default(now())

  @@index([domain])
}
```

Users whose email matches a whitelisted domain bypass the waitlist, invite code requirement, and admin approval entirely. They register and land directly at the granted tier. Works in all registration modes except `CLOSED`.

### 2.4 ServerSettings Additions

```prisma
model ServerSettings {
  // ... existing fields ...

  registrationMode    RegistrationMode @default(WAITLIST)
  maxInviteCodesPerUser  Int           @default(2)
}

enum RegistrationMode {
  CLOSED        // No new signups
  WAITLIST      // Signup → waitlist, admin approves
  INVITE_ONLY   // Must have valid invite code to register
  OPEN          // Anyone can register
}
```

---

## 3. Phase Details

### 3.1 Phase 1 — Private Alpha (Current, with tier rename)

**Registration mode:** `WAITLIST`

1. Visitor signs up → account created with `tier: WAITLIST`
2. Admin sees pending users in User Management table
3. Admin approves → user `tier` changes to `ALPHA`, account becomes active
4. User gets email notification: "You're in!"

**What changes from today:** The current "beta" tag becomes `ALPHA`. The approval flow stays the same — just the label is more accurate.

### 3.2 Phase 2 — Closed Beta

**Registration mode:** `INVITE_ONLY`

1. Admin flips `registrationMode` to `INVITE_ONLY`
2. System generates 2 invite codes per `ALPHA` user (controlled by `maxInviteCodesPerUser`)
3. Alpha users see their codes in Settings → Invites
4. Alpha user shares code with a friend
5. Friend registers with the code → account created with `tier: BETA`, `invitedById` set to the alpha user
6. The invite code is marked as used

**Registration form changes:** When `registrationMode` is `INVITE_ONLY`, the signup page shows an "Invite Code" field. No code = no registration (waitlist form can optionally remain as fallback).

### 3.3 Phase 3 — Expanded Beta

Same mechanics as Phase 2, but:

1. Admin grants 2 additional codes to all `BETA` users
2. This can be a one-click admin action: "Grant codes to all BETA users"
3. New signups from these codes are also `tier: BETA`
4. The referral chain is tracked: Admin → Alpha User → Beta User → Beta User's Friend

### 3.4 Phase 4 — Public Launch

**Registration mode:** `OPEN`

1. Admin flips `registrationMode` to `OPEN`
2. Anyone can register without a code → `tier: GENERAL`
3. Invite codes still work (existing users can still share them)
4. Referral tracking continues for attribution

---

## 4. Referral Chain Tracking

The `invitedById` field on User creates a tree:

```
Admin (you)
├── Alpha User A              (approved from waitlist)
│   ├── Beta User 1           (used A's code)
│   │   ├── Beta User 3       (used 1's code, if Phase 3)
│   │   └── Beta User 4
│   └── Beta User 2
├── Alpha User B
│   └── Beta User 5
└── Alpha User C              (approved from waitlist, hasn't invited anyone)
```

This gives you:

- **Growth attribution:** Who's bringing in the most engaged users?
- **Capacity planning:** How many users came in per wave?
- **Community quality signal:** If a subtree has high churn, you know where to look
- **Support context:** When a user reports an issue, you can see their invite chain

### 4.1 Admin Dashboard Additions

The User Management table gets new columns:

| Column | Description |
|--------|-------------|
| Tier | ALPHA / BETA / GENERAL badge |
| Invited By | Name of the user who invited them (link) |
| Invitees | Count of users they've invited |
| Codes | Used / Total invite codes |

Plus a new "Growth" section in admin:

- **Invite tree visualization** — expandable tree showing the referral chain
- **Tier breakdown** — pie chart: how many ALPHA vs BETA vs GENERAL
- **Growth rate** — signups per week, broken down by tier

---

## 5. API Endpoints

```
Invite Codes:
  GET    /api/invites              List current user's invite codes
  POST   /api/invites/generate     Generate codes (admin: for any user, user: for self if allowed)

Domain Whitelist:
  GET    /api/admin/domains        List whitelisted domains
  POST   /api/admin/domains        Add domain { domain, tier?, note? }
  DELETE /api/admin/domains/:id    Remove whitelisted domain

Admin:
  PATCH  /api/admin/users/:id      Now supports { tier: "ALPHA" } for waitlist approval
  POST   /api/admin/invites/grant  Bulk grant codes: { tier: "BETA", count: 2 }
  GET    /api/admin/growth         Growth stats and referral tree data

Registration:
  POST   /api/auth/register        Now accepts optional `inviteCode` field
```

---

## 6. Registration Flow Logic

```typescript
async function handleRegistration(email, password, inviteCode?) {
  const settings = await getServerSettings();

  // Domain whitelist check — bypasses all gates except CLOSED
  if (settings.registrationMode !== 'CLOSED') {
    const domain = email.split('@')[1].toLowerCase();
    const allowedDomain = await prisma.allowedDomain.findUnique({
      where: { domain }
    });
    if (allowedDomain) {
      return createUser({
        email,
        password,
        tier: allowedDomain.tier,  // Usually BETA
      });
    }
  }

  switch (settings.registrationMode) {
    case 'CLOSED':
      throw new Error('Registration is currently closed');

    case 'WAITLIST':
      // Create account but inactive until admin approves
      return createUser({ email, password, tier: 'WAITLIST' });

    case 'INVITE_ONLY':
      if (!inviteCode) {
        throw new Error('An invite code is required to register');
      }
      const code = await validateInviteCode(inviteCode);
      const user = await createUser({
        email,
        password,
        tier: code.tier,       // Usually BETA
        invitedById: code.createdById,
      });
      await markCodeUsed(code.id, user.id);
      return user;

    case 'OPEN':
      // If they have a code, use it for attribution; otherwise GENERAL
      if (inviteCode) {
        const code = await validateInviteCode(inviteCode);
        const user = await createUser({
          email,
          password,
          tier: code.tier,
          invitedById: code.createdById,
        });
        await markCodeUsed(code.id, user.id);
        return user;
      }
      return createUser({ email, password, tier: 'GENERAL' });
  }
}
```

---

## 7. Invite Code UX

### 7.1 User-Facing (Settings → Invites)

```
┌─────────────────────────────────────────────────┐
│  🎟️  Your Invite Codes                          │
│                                                 │
│  Share these with friends to give them access    │
│  to Tandem.                                     │
│                                                 │
│  TND-A3F8    ✅ Used by Sarah Chen              │
│  TND-K9M2    📋 Copy    📤 Share                │
│                                                 │
│  0 of 2 codes remaining                         │
└─────────────────────────────────────────────────┘
```

The Share button generates a link like `https://your-server.com/register?code=TND-K9M2`.

### 7.2 Registration Page (Invite-Only Mode)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Join Tandem                                    │
│                                                 │
│  Tandem is currently invite-only.               │
│  Enter your invite code to create an account.   │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Invite Code: TND-K9M2                  │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │  Email                                  │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │  Password                               │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [ Create Account ]                             │
│                                                 │
│  Don't have a code? Join the waitlist →         │
│                                                 │
└─────────────────────────────────────────────────┘
```

If they arrive via a share link, the code field is pre-filled.

---

## 8. Domain Whitelist

### 8.1 How It Works

Admin adds a domain (e.g. `ketiv.com`) to the whitelist. Any user registering with an email on that domain skips the waitlist, skips invite codes, and lands directly at the configured tier — no admin approval needed.

The whitelist is checked **before** the registration mode switch, so it works in `WAITLIST`, `INVITE_ONLY`, and `OPEN` modes. Only `CLOSED` blocks everything.

Use cases:
- **Onboard your whole team:** whitelist your company domain so coworkers can self-register
- **Partner organizations:** grant access to a collaborator's org without burning invite codes
- **Phased rollout by org:** whitelist one domain at a time as you expand

### 8.2 Admin UI (Settings → Domain Whitelist)

```
┌─────────────────────────────────────────────────┐
│  🌐  Domain Whitelist                           │
│                                                 │
│  Users with emails on these domains can         │
│  register without an invite code or approval.   │
│                                                 │
│  ketiv.com        BETA    "KETIV coworkers"  🗑 │
│  example.org      ALPHA   "Partner org"      🗑 │
│                                                 │
│  ┌──────────────┐ ┌──────┐ ┌────────────────┐  │
│  │ Domain       │ │ Tier │ │ Note (optional) │  │
│  └──────────────┘ └──────┘ └────────────────┘  │
│  [ Add Domain ]                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 8.3 Migration Note

Add `AllowedDomain` table — no existing data to migrate, just create the table. The registration flow checks it before falling through to the normal mode logic.

---

## 9. Capacity Planning Integration

The tier system doubles as a scaling signal:

| Metric | What It Tells You |
|--------|-------------------|
| Total ALPHA users | Your hand-picked testers — highest signal for bugs/feedback |
| Total BETA users | Friends-of-friends — broader usage patterns, real-world load |
| BETA growth rate | How fast the network is expanding — do you need more server? |
| Codes outstanding | Unredeemed codes = potential future signups to plan for |

When you see BETA user count approaching your server's comfortable capacity, that's your signal to either upgrade infrastructure or hold off on granting more codes.

---

## 10. Migration from Current System

1. **Add `tier` column** to User with default `ALPHA` (existing approved users are your alpha testers)
2. **Add `invitedById`** column, nullable
3. **Create InviteCode table**
4. **Add `registrationMode`** to ServerSettings, default `WAITLIST`
5. Any currently unapproved waitlist users get `tier: WAITLIST`
6. Update admin User Management UI to show tier badges and approval sets tier to `ALPHA`

No breaking changes — existing users get grandfathered as ALPHA, which is accurate since they're your earliest testers.

---

## 11. Future Considerations

- **Code expiry:** Optional `expiresAt` on codes for time-limited campaigns
- **Tier-specific features:** Could gate certain features by tier (e.g., ALPHA gets early access to new features)
- **Invite analytics:** Track which invite chains produce the most active users
- **Automatic code grants:** Instead of manual admin action, automatically grant codes when a user hits an activation metric (e.g., completed first weekly review)
- **Waitlist position:** Show waitlist users their position and estimated timeline
