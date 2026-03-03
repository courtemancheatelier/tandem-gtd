# Tandem Feature Spec: Waitlist Origin Tracking & Login Activity

**Version:** 1.0  
**Date:** February 27, 2026  
**Author:** Jason Courtemanche  
**Status:** Draft  

---

## 1. Problem

During the closed beta rollout, users are added from the waitlist manually. Once they have an account, there's no way to distinguish waitlist-originated users from other users (e.g., direct invites, team joins). More importantly, there's no visibility into whether a waitlist user has ever actually logged in. Users who never log in after being invited are taking up a beta slot that could go to someone who'd actually use it.

The admin needs two things at a glance:

1. **Was this user added from the waitlist?** — To track conversion from interest → active user.
2. **Have they ever logged in?** — To identify inactive invitees for follow-up or removal after 6 months.

---

## 2. Schema Changes

### 2.1 User Model Additions

```prisma
model User {
  // ... existing fields ...

  // Waitlist & login tracking
  source        UserSource  @default(DIRECT)    // How this user was added
  invitedAt     DateTime?                        // When the beta invite was sent/account created from waitlist
  firstLoginAt  DateTime?                        // Set once on first successful login, never updated again
  lastLoginAt   DateTime?                        // Updated on every login
}

enum UserSource {
  DIRECT          // Created directly by admin or self-registered (future)
  WAITLIST        // Added from the waitlist
  TEAM_INVITE     // Joined via team invitation
  INVITE_LINK     // Joined via invite link
}
```

### 2.2 Migration

```sql
-- Add new columns with safe defaults
ALTER TABLE "User" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "User" ADD COLUMN "invitedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "firstLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Backfill: Existing users all predate waitlist tracking.
-- Leave them as DIRECT. No data migration needed.
```

Non-breaking migration — all new columns are nullable or have defaults.

---

## 3. Login Tracking Implementation

### 3.1 Where to Hook In

Update the NextAuth `signIn` callback in `src/lib/auth.ts`. After successful authentication (all three cases — existing account, auto-linked account, new user), record the login timestamp.

```typescript
// In the signIn callback, after successful auth:
async signIn({ user, account }) {
  // ... existing logic for Cases 1, 2, 3 ...

  // After successful auth, update login timestamps
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: now,
      // Only set firstLoginAt if it's null (first time ever)
      ...(user.firstLoginAt === null && { firstLoginAt: now }),
    },
  });

  return true;
}
```

**Important:** The `firstLoginAt` field uses a conditional update — it's only set when null. This ensures it captures the very first login and never changes, giving an accurate "time to first login" metric.

### 3.2 Edge Case: Existing Users at Migration Time

Existing users who are already active won't have `firstLoginAt` set. Two options:

- **Option A (recommended):** Backfill `firstLoginAt = createdAt` for all existing users at migration time. Assumes anyone who already has an account has logged in at least once.
- **Option B:** Leave null and let it populate on next login. Downside: active users will show as "never logged in" until they log in again post-migration.

Go with Option A:

```sql
-- Backfill existing users
UPDATE "User" SET "firstLoginAt" = "createdAt", "lastLoginAt" = "createdAt"
WHERE "firstLoginAt" IS NULL;
```

---

## 4. Admin User Management Table Changes

### 4.1 New Columns

Add two visual indicators to the existing `UserManagementTable`:

| Column | Header | Content |
|--------|--------|---------|
| Source | `Source` | Badge showing `Waitlist`, `Direct`, `Team Invite`, or `Invite Link` |
| Login Status | `Login Activity` | Status indicator (see below) |

### 4.2 Login Activity Display Logic

```typescript
function getLoginStatus(user: AdminUser) {
  if (!user.firstLoginAt) {
    // Never logged in
    const daysSinceInvite = differenceInDays(new Date(), user.createdAt);
    if (daysSinceInvite >= 180) {
      return { label: "Never logged in", variant: "destructive", stale: true };
    } else if (daysSinceInvite >= 90) {
      return { label: "Never logged in", variant: "warning", stale: false };
    }
    return { label: "Never logged in", variant: "secondary", stale: false };
  }

  // Has logged in at least once
  const daysSinceLastLogin = differenceInDays(new Date(), user.lastLoginAt!);
  if (daysSinceLastLogin >= 180) {
    return { label: `Inactive ${daysSinceLastLogin}d`, variant: "destructive", stale: true };
  } else if (daysSinceLastLogin >= 90) {
    return { label: `Inactive ${daysSinceLastLogin}d`, variant: "warning", stale: false };
  }
  return { label: "Active", variant: "default", stale: false };
}
```

**Color coding:**

- 🟢 **Default** — Active (logged in within 90 days)
- 🟡 **Warning** — 90–179 days since login (or since invite with no login)
- 🔴 **Destructive** — 180+ days, eligible for follow-up or removal

### 4.3 Source Badge Colors

```typescript
const sourceBadgeVariant: Record<UserSource, string> = {
  WAITLIST:     "outline",     // Visually distinct — the one you care about
  DIRECT:       "secondary",
  TEAM_INVITE:  "secondary",
  INVITE_LINK:  "secondary",
};
```

The `Waitlist` badge should use a distinct style (e.g., outline with a specific color or icon) so it's immediately scannable.

### 4.4 Updated Table Layout

```
| Name        | Email              | Source    | Login Activity    | Admin | AI | Usage | Actions |
|-------------|--------------------|-----------|--------------------|-------|----|-------|---------|
| Jason       | jason@...          | Direct    | Active             | ✅    | ✅ | 12/100| ✏️      |
| Sarah       | sarah@...          | Waitlist  | Never logged in 🔴 | ❌    | ✅ | 0/100 | ✏️      |
| Mike        | mike@...           | Waitlist  | Active             | ❌    | ✅ | 45/100| ✏️      |
| Alex        | alex@...           | Waitlist  | Inactive 142d 🟡   | ❌    | ✅ | 3/100 | ✏️      |
```

### 4.5 Filtering & Sorting

Add a filter dropdown above the table:

```typescript
// Filter options
const sourceFilters = [
  { label: "All Users", value: "all" },
  { label: "Waitlist Only", value: "WAITLIST" },
  { label: "Never Logged In", value: "never_logged_in" },
  { label: "Stale (180+ days)", value: "stale" },
];
```

Sortable columns: `Name`, `Source`, `Login Activity` (sort by `lastLoginAt` or `createdAt` if never logged in), `Created`.

---

## 5. Admin User Edit Dialog Changes

### 5.1 New Fields in `UserEditDialog`

Add a read-only info section to the existing edit dialog:

```
┌─────────────────────────────────────────┐
│  Edit User: Sarah                       │
│                                         │
│  Name:  [Sarah          ]               │
│  Email: [sarah@email.com]               │
│  Role:  [  ] Admin                      │
│  AI:    [✓] Enabled    Limit: [100]     │
│                                         │
│  ── Account Info ──────────────────────  │
│  Source:          Waitlist               │
│  Invited:         Jan 15, 2026          │
│  First Login:     Never                 │
│  Last Login:      Never                 │
│  Days Since Invite: 43                  │
│                                         │
│  [Cancel]                    [Save]     │
└─────────────────────────────────────────┘
```

### 5.2 Editable Source Field

The `source` field should be editable in case you need to correct a user's origin after creation. Use a select dropdown with the `UserSource` enum values.

---

## 6. Setting Source on User Creation

### 6.1 Admin Creates User from Waitlist

When adding a user through the admin panel (or however users are currently created), add a `source` selector:

```typescript
// In the user creation flow (admin API or UI)
// If creating from waitlist context:
await prisma.user.create({
  data: {
    email,
    name,
    password: null,
    source: "WAITLIST",
    invitedAt: new Date(),
  },
});
```

If there's a dedicated "Add from Waitlist" action in the future, it should automatically set `source: "WAITLIST"` and `invitedAt: new Date()`.

### 6.2 Other Sources

- **Team invites** (`TEAM_INVITE`): Set when a user is created via the team invitation flow from the TEAMS spec.
- **Invite links** (`INVITE_LINK`): Set when a user joins via a generated invite link.
- **Direct** (`DIRECT`): Default for any other creation path.

---

## 7. API Changes

### 7.1 GET `/api/admin/users`

Add the new fields to the response:

```typescript
// Updated select in the admin users query
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    isAdmin: true,
    createdAt: true,
    source: true,
    invitedAt: true,
    firstLoginAt: true,
    lastLoginAt: true,
    // ... existing fields (aiEnabled, aiDailyLimit, etc.)
  },
  orderBy: { createdAt: "desc" },
});
```

### 7.2 PATCH `/api/admin/users/[id]`

Allow updating `source` through the existing user edit endpoint:

```typescript
// Add to the allowed update fields
const { source, ...otherFields } = body;
if (source && ["DIRECT", "WAITLIST", "TEAM_INVITE", "INVITE_LINK"].includes(source)) {
  updateData.source = source;
}
```

---

## 8. AdminUser Type Update

```typescript
// src/components/admin/UserEditDialog.tsx
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  source: "DIRECT" | "WAITLIST" | "TEAM_INVITE" | "INVITE_LINK";
  invitedAt: string | null;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  aiEnabled: boolean;
  aiDailyLimit: number | null;
  _count?: { tasks: number };
};
```

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `UserSource` enum, add `source`, `invitedAt`, `firstLoginAt`, `lastLoginAt` fields to `User` |
| `src/lib/auth.ts` | Update `signIn` callback to set `firstLoginAt` and `lastLoginAt` |
| `src/app/api/admin/users/route.ts` | Include new fields in GET response |
| `src/app/api/admin/users/[id]/route.ts` | Allow `source` updates in PATCH |
| `src/components/admin/UserManagementTable.tsx` | Add Source and Login Activity columns, add filter dropdown |
| `src/components/admin/UserEditDialog.tsx` | Add read-only account info section, editable source select, update `AdminUser` type |

---

## 10. Future Considerations

- **Automated stale user notifications:** Cron job that flags users approaching the 180-day mark and optionally sends a "Hey, we saved your spot" email.
- **Waitlist integration:** When a proper waitlist signup form exists, automatically create the user with `source: WAITLIST` and `invitedAt` set, leaving them in a pending state until admin approves.
- **Bulk actions:** Select multiple stale users and batch remove or send follow-up emails.
- **Retention metrics dashboard:** Chart showing waitlist → first login conversion rates and time-to-first-login distribution.
