# Account Deletion — Self-Service "Delete My Account"

> **Status:** Draft
> **Last updated:** 2026-02-24

---

## 1. Problem Statement

### The Need

Users have no way to delete their own account. The only deletion path is through the admin panel (`DELETE /api/admin/users/[id]`), which requires admin credentials and prevents self-deletion. This means:

- A user who wants to leave Tandem must ask the admin to delete their account
- No GDPR "right to erasure" compliance for self-hosted instances with EU users
- No clean exit path — users who stop using Tandem leave orphaned data behind
- The admin delete endpoint has cascade gaps: `BaselineSnapshot`, `Team.createdById`, `WaitlistEntry.promotedUserId`, and `HelpArticle.lastEditedById` can be orphaned

### What "Done" Looks Like

1. Users can delete their own account from a "Danger Zone" section in Settings.
2. Deletion requires explicit confirmation (type account email to confirm).
3. All user data is completely removed — no orphaned records in the database.
4. Active sessions are invalidated after deletion.
5. The existing admin delete endpoint also gets the cascade fixes.
6. Optional: user can export their data before deleting (ties into Import/Export spec, not required for this spec).

### Design Constraints

- Prisma cascade handles most cleanup — fix the gaps in the schema rather than writing manual delete queries
- JWT strategy means server-side session invalidation requires a lightweight check (see section 5)
- Must not break the admin delete flow — both paths (self-delete and admin-delete) use the same underlying logic
- Admins cannot delete themselves (existing safety check stays)
- The last remaining admin cannot delete their account (would leave the instance admin-less)

---

## 2. Schema Fixes — Close Cascade Gaps

Before adding self-delete UI, fix the existing cascade gaps so that `prisma.user.delete()` cleanly removes everything.

### 2.1 BaselineSnapshot

**Current:** `userId` has no `onDelete` behavior defined. Orphans records when user is deleted.

```prisma
// Change from:
userId          String

// Change to:
userId          String
user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
```

### 2.2 Team.createdById

**Current:** No cascade. Teams created by a deleted user become orphaned with a dangling `createdById`.

```prisma
// Change from:
createdById     String
createdBy       User     @relation(fields: [createdById], references: [id])

// Change to:
createdById     String
createdBy       User     @relation(fields: [createdById], references: [id], onDelete: SetNull)
```

Use `SetNull` (not `Cascade`) — deleting a user who created a team shouldn't delete the entire team if other members exist. The `createdById` becomes null, and ownership can be reassigned by another admin.

Make `createdById` nullable: `createdById String?`

### 2.3 WaitlistEntry.promotedUserId

**Current:** Nullable relation, no explicit cascade. Already handles deletion gracefully since the field is optional, but should explicitly set null.

```prisma
// Change from:
promotedUser    User?    @relation(fields: [promotedUserId], references: [id])

// Change to:
promotedUser    User?    @relation(fields: [promotedUserId], references: [id], onDelete: SetNull)
```

Status stays `PROMOTED` — the waitlist entry records that someone was promoted even though the user is now gone.

### 2.4 HelpArticle.lastEditedById

**Current:** Nullable relation, no explicit cascade.

```prisma
// Change from:
lastEditedBy    User?    @relation(fields: [lastEditedById], references: [id])

// Change to:
lastEditedBy    User?    @relation(fields: [lastEditedById], references: [id], onDelete: SetNull)
```

Help articles are global content — they stay. The editor reference just clears.

### 2.5 Run Migration

After all schema changes: `npx prisma db push` (or a proper migration for production).

---

## 3. Deletion Service

Create a shared service that both self-delete and admin-delete use. This ensures consistent behavior regardless of who triggers the deletion.

### 3.1 Service Function

**New file:** `src/lib/services/account-deletion-service.ts`

```ts
import { prisma } from "@/lib/prisma";

interface DeleteAccountResult {
  success: boolean;
  error?: string;
}

export async function deleteUserAccount(
  targetUserId: string,
  actingUserId: string
): Promise<DeleteAccountResult> {
  // Safety check: cannot delete yourself if you're an admin
  // (self-delete for non-admins is allowed)
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isAdmin: true, email: true },
  });

  if (!targetUser) {
    return { success: false, error: "User not found" };
  }

  // If self-deleting as admin, check if they're the last admin
  if (targetUserId === actingUserId && targetUser.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return {
        success: false,
        error: "Cannot delete the last admin account. Promote another user to admin first.",
      };
    }
  }

  // Transfer team ownership before deletion
  // Find teams where this user is the sole admin member
  const ownedTeams = await prisma.team.findMany({
    where: { createdById: targetUserId },
    select: { id: true, name: true },
  });

  // Prisma cascade + SetNull handles the rest
  await prisma.user.delete({ where: { id: targetUserId } });

  return { success: true };
}
```

### 3.2 Update Admin Delete Endpoint

**File:** `src/app/api/admin/users/[id]/route.ts`

Replace the inline `prisma.user.delete()` with `deleteUserAccount()`:

```ts
import { deleteUserAccount } from "@/lib/services/account-deletion-service";

// In DELETE handler:
const result = await deleteUserAccount(targetUserId, auth.userId);
if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: 400 });
}
return NextResponse.json({ success: true });
```

Keep the existing admin-only auth check and self-delete prevention for the admin endpoint.

---

## 4. Self-Delete API Endpoint

**New file:** `src/app/api/account/delete/route.ts`

```ts
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const { confirmEmail } = body;

  // Verify the user typed their email correctly
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user || confirmEmail !== user.email) {
    return NextResponse.json(
      { error: "Email confirmation does not match" },
      { status: 400 }
    );
  }

  const result = await deleteUserAccount(userId, userId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
```

The endpoint:
- Requires authentication (user must be logged in)
- Requires email confirmation (prevents accidental deletion)
- Uses the shared `deleteUserAccount` service
- Returns success — the client then signs the user out

---

## 5. Session Invalidation

### The Problem

Tandem uses JWT sessions (stateless). After `prisma.user.delete()`, the JWT token in the browser is still valid for up to 14 days. If someone has the token, they could make API requests to a non-existent user (which would fail on DB lookups, but it's messy).

### The Fix — Lightweight Deleted-User Check

Add a `deletedAt` timestamp approach, or simpler: after deletion, the user doesn't exist in the DB. Any authenticated API call that runs `getCurrentUserId()` and then queries `prisma.user.findUnique()` will get `null` and return 401/403.

**Current behavior check:** Read `src/lib/api/auth-helpers.ts`:
- `getCurrentUserId()` extracts the user ID from the JWT — this succeeds even after deletion
- But every API endpoint that uses the userId to query data will get empty results or 404s
- The session itself (name, email in the JWT) will appear valid in the browser until it expires

**Recommended fix:** Add a user-existence check in the auth helpers:

```ts
// In getCurrentUserId() or a new middleware:
const session = await getServerSession(authOptions);
if (!session?.user?.id) return null;

// Quick existence check (cached per request)
const userExists = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { id: true },
});
if (!userExists) return null;
```

This adds one lightweight DB query per authenticated request. Since Prisma already opens a connection for every request anyway, the overhead is minimal.

**Alternative:** Force sign-out on the client after the delete API returns success. The client calls `signOut({ callbackUrl: "/login" })` which clears the JWT cookie. This handles the normal case. The existence check handles edge cases (stolen token, multiple tabs).

### Client-Side Flow

After the delete API returns `{ success: true }`:

```ts
// In the settings page:
const res = await fetch("/api/account/delete", { method: "POST", body: ... });
if (res.ok) {
  // Clear local storage (sidebar state, quick views, etc.)
  localStorage.clear();
  // Sign out and redirect to login
  signOut({ callbackUrl: "/login?deleted=true" });
}
```

The login page can show a confirmation message when `?deleted=true` is present: "Your account and all data have been deleted."

---

## 6. Settings Page UI

### 6.1 Danger Zone Section

**File:** `src/app/(dashboard)/settings/page.tsx`

Add a "Danger Zone" section at the bottom of the settings page:

```
──────────────────────────────────────

Danger Zone

Delete Account
Permanently delete your account and all associated data.
This action cannot be undone.

[Delete My Account]  (destructive red button)
```

### 6.2 Confirmation Dialog

Clicking "Delete My Account" opens a confirmation dialog:

```
┌─────────────────────────────────────┐
│  Delete Account                     │
│                                     │
│  This will permanently delete:      │
│                                     │
│  • All your tasks and projects      │
│  • Your inbox and waiting-for items │
│  • Your wiki articles               │
│  • Your contexts, areas, and goals  │
│  • Your horizon notes and reviews   │
│  • Your recurring templates         │
│  • Your API tokens and OAuth links  │
│                                     │
│  This action cannot be undone.      │
│                                     │
│  Type your email to confirm:        │
│  [_______________________________]  │
│                                     │
│  [Cancel]  [Delete My Account]      │
│            (red, disabled until     │
│             email matches)          │
└─────────────────────────────────────┘
```

The delete button is disabled until the typed email exactly matches the user's email. This prevents accidental clicks.

### 6.3 Component

**New file:** `src/components/settings/DeleteAccountSection.tsx`

```tsx
"use client";

export function DeleteAccountSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { data: session } = useSession();

  const emailMatch = confirmEmail === session?.user?.email;

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail }),
    });

    if (res.ok) {
      localStorage.clear();
      signOut({ callbackUrl: "/login?deleted=true" });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-destructive/50 p-6">
      <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Permanently delete your account and all associated data. This cannot be undone.
      </p>
      <Button
        variant="destructive"
        className="mt-4"
        onClick={() => setDialogOpen(true)}
      >
        Delete My Account
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Confirmation dialog content */}
      </Dialog>
    </div>
  );
}
```

---

## 7. Implementation Plan

### Phase 1 — Schema Fixes + Deletion Service

1. Fix cascade gaps in `prisma/schema.prisma`: BaselineSnapshot, Team.createdById, WaitlistEntry, HelpArticle
2. Run `prisma db push`
3. Create `src/lib/services/account-deletion-service.ts`
4. Update admin delete endpoint to use the shared service
5. Test: admin deletes a user → no orphaned records

**Files:**

| Action | File |
|--------|------|
| MODIFY | `prisma/schema.prisma` |
| CREATE | `src/lib/services/account-deletion-service.ts` |
| MODIFY | `src/app/api/admin/users/[id]/route.ts` |

### Phase 2 — Self-Delete API + Session Handling

1. Create `POST /api/account/delete` endpoint with email confirmation
2. Add user-existence check in auth helpers (prevents deleted-user ghost sessions)
3. Handle `?deleted=true` on login page (show confirmation message)

**Files:**

| Action | File |
|--------|------|
| CREATE | `src/app/api/account/delete/route.ts` |
| MODIFY | `src/lib/api/auth-helpers.ts` |
| MODIFY | `src/app/(auth)/login/page.tsx` |

### Phase 3 — Settings UI

1. Create `DeleteAccountSection` component
2. Add Danger Zone section to settings page
3. Wire up confirmation dialog with email validation

**Files:**

| Action | File |
|--------|------|
| CREATE | `src/components/settings/DeleteAccountSection.tsx` |
| MODIFY | `src/app/(dashboard)/settings/page.tsx` |

**Test:** User opens Settings → scrolls to Danger Zone → clicks Delete → types email → confirms → data deleted → signed out → lands on login page with "account deleted" message. Verify DB has no orphaned records.

---

## 8. Edge Cases

### Last Admin Tries to Self-Delete
Blocked by the deletion service: "Cannot delete the last admin account. Promote another user to admin first." The admin count check prevents an instance from becoming admin-less.

### User Deletes Account Mid-Session in Another Tab
Tab 1: user deletes account. Tab 2: user is still browsing. Tab 2's next API call hits the user-existence check in auth helpers → returns null → redirects to login. No errors, no data leaks.

### User with Team Ownership
The team's `createdById` is set to null (via `SetNull` cascade). The team and other members remain. Another admin can claim ownership or reassign. If the user is the only member of the team, the team becomes orphaned but harmless — an admin can clean it up.

### User with Assigned Tasks from Others
Tasks where `assignedToId` = deleted user are set to null (existing `SetNull` behavior). The tasks remain, just unassigned. Task owners see "Unassigned" instead of the deleted user's name.

### Deleted User's Email Reused
If someone signs up with the same email after deletion, they get a fresh account. No data from the deleted account is recoverable. The waitlist entry (if any) stays with `promotedUserId: null`.

### Rapid Double-Click on Delete Button
The `deleting` state disables the button after first click. The API endpoint is idempotent — if the user is already deleted, the service returns "User not found."

---

## 9. What This Spec Does Not Cover

- **Data export before deletion** — covered by the Import/Export spec. When implemented, the Danger Zone section should include a "Download my data" link before the delete button.
- **Soft delete / grace period** — some apps offer a 30-day grace period where the account is disabled but not deleted, with an option to reactivate. Not needed for beta. Can be added later if users request it.
- **Deletion audit log** — recording who was deleted and when for compliance. The cascade deletes all user data including events, so there's no trace. A separate `DeletionLog` model could track this if needed for GDPR compliance.
- **Email confirmation of deletion** — sending an email to confirm the account was deleted. Requires email sending infrastructure (not yet built).
- **Admin notification of self-deletion** — notifying the admin when a user deletes their account. Nice to have but not critical.
