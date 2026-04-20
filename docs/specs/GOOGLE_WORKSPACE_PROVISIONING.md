# Tandem — Google Workspace Group Provisioning Bridge

**Date:** March 14, 2026  
**Extends:** TEAMS.md, `prisma/schema.prisma`, `src/app/api/admin/settings/`  
**Status:** Draft  
**Copyright:** Courtemanche Atelier

---

## Overview

Managed hosting customers who use Google Workspace can connect their Google Groups to Tandem teams. When a user signs in via Google OAuth, Tandem reads their group memberships and automatically provisions the correct Tandem team assignments — no manual invitations required.

From the admin's perspective: add a user to the right Google Group, and they'll have the right Tandem team access the next time they sign in. Remove them from the group, and access is revoked on the next sync.

This feature is available on both Community and Dedicated managed hosting tiers.

---

## 1. How It Works (Non-Technical Summary)

**Setup (one-time, done by Tandem admin):**

1. Admin creates a Google Service Account in Google Cloud Console and grants it domain-wide delegation.
2. Admin pastes the service account credentials into the Tandem Admin Settings panel.
3. Admin maps each Google Group email to a Tandem team (and optionally a default role and label).

**Ongoing (automatic):**

- Every time a user signs in via Google OAuth, Tandem calls the Google Admin Directory API to get their current group memberships, compares against the mapping table, and adds or removes them from Tandem teams accordingly.
- A background sync job runs every 24 hours to catch changes for users who haven't signed in recently.

**What does not change:**

- Users who were added to teams manually (not via provisioning) are unaffected — the sync only manages memberships that were provisioned through this bridge.
- Personal GTD data (tasks, projects, inbox) is never touched by provisioning.
- A user removed from a Google Group is auto-removed from the corresponding Tandem team.

---

## 2. Data Model

### 2.1 New Models

```prisma
// ============================================================================
// GOOGLE WORKSPACE PROVISIONING
// ============================================================================

/// Admin-configured mapping from a Google Group to a Tandem team.
/// Each row means: "members of this Google Group belong to this Tandem team."
model GoogleGroupMapping {
  id            String   @id @default(cuid())
  groupEmail    String   // e.g. "engineering@acme.com"
  teamId        String   @map("team_id")
  defaultRole   TeamRole @default(MEMBER) // Role to assign on provisioning
  defaultLabel  String?  // Optional label e.g. "Staff", "Volunteer"
  isActive      Boolean  @default(true)   // Disable without deleting
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  team          Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([groupEmail, teamId])
  @@index([teamId])
  @@map("google_group_mappings")
}

/// Audit log of all provisioning events (add, remove, skip, error).
/// Retained for 90 days, then purged by the data retention job.
model ProvisioningEvent {
  id          String              @id @default(cuid())
  userId      String?             @map("user_id")   // null if user not yet created
  userEmail   String              @map("user_email")
  groupEmail  String              @map("group_email")
  teamId      String?             @map("team_id")
  action      ProvisioningAction
  detail      String?             // Human-readable note or error message
  source      ProvisioningSource  // "SIGNIN" or "BACKGROUND_SYNC"
  occurredAt  DateTime @default(now()) @map("occurred_at")

  @@index([userId])
  @@index([occurredAt])
  @@map("provisioning_events")
}

enum ProvisioningAction {
  ADDED          // User added to team
  REMOVED        // User removed from team
  SKIPPED        // Already a member, no change
  ERROR          // API call or mapping failure
}

enum ProvisioningSource {
  SIGNIN            // Triggered by user signing in
  BACKGROUND_SYNC   // Triggered by scheduled job
}
```

### 2.2 Modified Models

**`TeamMember`** gains a `provisionedBy` field to distinguish manually-added members from Google-provisioned ones. The sync only manages rows it created — it never removes manually-added members.

```prisma
model TeamMember {
  // ... existing fields ...

  provisionedBy  String?   @map("provisioned_by")
  // null = manually added
  // "google_workspace" = managed by provisioning bridge
}
```

**`ServerSettings`** gains Google Workspace configuration fields:

```prisma
model ServerSettings {
  // ... existing fields ...

  // Google Workspace Provisioning
  googleWorkspaceEnabled      Boolean  @default(false)
  googleServiceAccountJson    String?  @db.Text  // Encrypted JSON credential blob
  googleWorkspaceDomain       String?  // e.g. "acme.com" — used to scope API calls
  googleAdminEmail            String?  // The impersonated admin account email
  googleSyncIntervalHours     Int      @default(24)
  googleLastSyncAt            DateTime?
  googleLastSyncStatus        String?  // "ok" | "error: <message>"
}
```

### 2.3 No Schema Conflicts

The `GoogleGroupMapping` model is purely additive. Existing `Team`, `TeamMember`, and `ServerSettings` models are extended with new nullable/defaulted fields only — no breaking migrations.

---

## 3. Google Cloud Setup (Admin One-Time Configuration)

This is documented in the Tandem admin panel and in the managed hosting onboarding guide. The steps are:

1. **Create a Google Cloud Project** (or use existing one).
2. **Enable the Admin SDK API** (`admin.googleapis.com`).
3. **Create a Service Account.** Download the JSON key file.
4. **Grant Domain-Wide Delegation** to the service account in Google Workspace Admin Console. Required scopes:
   - `https://www.googleapis.com/auth/admin.directory.group.member.readonly`
   - `https://www.googleapis.com/auth/admin.directory.group.readonly`
5. **Identify a delegated admin email** — the service account impersonates this Google Workspace admin user when making API calls. It must be a real account with Admin SDK read access.
6. **Paste the JSON credential blob** into Tandem Admin Settings → Google Workspace.
7. **Enter the domain and admin email** in the same form.
8. **Test the connection** via the "Test Connection" button — Tandem makes a single test call to list groups and confirms the credentials work.
9. **Add group → team mappings** in the mapping table.

The JSON credential blob is encrypted at rest using the same `encrypt()` helper used for the Anthropic API key.

---

## 4. Sign-In Flow Integration

Provisioning is triggered in the `signIn` NextAuth callback, after the user row is confirmed to exist. It runs only for `account.provider === "google"`.

```typescript
// In authOptions.callbacks.signIn (src/lib/auth.ts)

async signIn({ user, account, profile }) {
  // ... existing user creation / account linking logic ...

  // After user is confirmed in DB:
  if (account?.provider === "google" && user.id) {
    // Fire-and-forget — don't block sign-in on provisioning
    syncGoogleGroupMembership(user.id, user.email!, "SIGNIN").catch((err) => {
      console.error("[provisioning] sign-in sync failed:", err);
    });
  }

  return true;
}
```

`syncGoogleGroupMembership` is the shared sync function used by both sign-in and background job (see §5).

**Why fire-and-forget:** A Google API failure must never block sign-in. If provisioning fails, the error is logged to `ProvisioningEvent` and the user signs in normally. The next background sync will retry.

---

## 5. Core Sync Function

```typescript
// src/lib/provisioning/google-workspace.ts

export async function syncGoogleGroupMembership(
  userId: string,
  userEmail: string,
  source: "SIGNIN" | "BACKGROUND_SYNC"
): Promise<void> {
  // 1. Check provisioning is enabled and credentials exist
  const settings = await prisma.serverSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.googleWorkspaceEnabled || !settings.googleServiceAccountJson) return;

  // 2. Decrypt service account credentials
  const credentials = JSON.parse(decrypt(settings.googleServiceAccountJson));

  // 3. Build Google API client with domain-wide delegation
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
    ],
    subject: settings.googleAdminEmail!, // Impersonate this admin
  });

  const admin = google.admin({ version: "directory_v1", auth });

  // 4. Fetch user's current Google Group memberships
  let googleGroups: string[] = [];
  try {
    const res = await admin.groups.list({ userKey: userEmail, domain: settings.googleWorkspaceDomain! });
    googleGroups = (res.data.groups ?? []).map((g) => g.email!).filter(Boolean);
  } catch (err) {
    await logProvisioningEvent({ userId, userEmail, action: "ERROR", source, detail: String(err) });
    return;
  }

  // 5. Load active group mappings
  const mappings = await prisma.googleGroupMapping.findMany({
    where: { isActive: true },
  });

  // 6. Load user's currently provisioned team memberships
  const existingProvisionedMemberships = await prisma.teamMember.findMany({
    where: { userId, provisionedBy: "google_workspace" },
  });
  const existingTeamIds = new Set(existingProvisionedMemberships.map((m) => m.teamId));

  // 7. Determine target state from current Google Groups
  const targetMappings = mappings.filter((m) => googleGroups.includes(m.groupEmail));
  const targetTeamIds = new Set(targetMappings.map((m) => m.teamId));

  // 8. ADD: teams the user should be in but isn't
  for (const mapping of targetMappings) {
    if (existingTeamIds.has(mapping.teamId)) {
      await logProvisioningEvent({ userId, userEmail, groupEmail: mapping.groupEmail, teamId: mapping.teamId, action: "SKIPPED", source });
      continue;
    }

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: mapping.teamId, userId } },
      create: {
        teamId: mapping.teamId,
        userId,
        role: mapping.defaultRole,
        label: mapping.defaultLabel ?? null,
        provisionedBy: "google_workspace",
      },
      update: {}, // Don't overwrite manually-changed roles
    });

    await logProvisioningEvent({ userId, userEmail, groupEmail: mapping.groupEmail, teamId: mapping.teamId, action: "ADDED", source });
  }

  // 9. REMOVE: provisioned memberships whose Google Group is no longer matched
  for (const membership of existingProvisionedMemberships) {
    if (!targetTeamIds.has(membership.teamId)) {
      await prisma.teamMember.delete({ where: { id: membership.id } });

      const mapping = mappings.find((m) => m.teamId === membership.teamId);
      await logProvisioningEvent({
        userId,
        userEmail,
        groupEmail: mapping?.groupEmail ?? "(unknown)",
        teamId: membership.teamId,
        action: "REMOVED",
        source,
      });
    }
  }
}
```

**Key invariant:** Only rows with `provisionedBy: "google_workspace"` are ever auto-removed. A Tandem admin who manually adds a user to a team is not affected by this sync, even if that user is not in a mapped Google Group.

---

## 6. Background Sync Job

The background sync runs on a configurable interval (default: every 24 hours). It is implemented as a Next.js API route called by a systemd timer on the managed hosting server.

```
# /etc/systemd/system/tandem-google-sync.timer
[Unit]
Description=Tandem Google Workspace group sync

[Timer]
OnBootSec=5min
OnUnitActiveSec=24h

[Install]
WantedBy=timers.target
```

```
# /etc/systemd/system/tandem-google-sync.service
[Unit]
Description=Tandem Google Workspace group sync job

[Service]
Type=oneshot
ExecStart=curl -s -X POST https://your-tandem.com/api/admin/google-sync \
  -H "Authorization: Bearer $TANDEM_SYNC_SECRET"
```

The sync secret is a long random string stored in `.env` as `TANDEM_SYNC_SECRET`. It is checked in the route handler before running.

### 6.1 Sync Route

```
POST /api/admin/google-sync
Authorization: Bearer <TANDEM_SYNC_SECRET>
```

The handler:
1. Verifies the bearer token.
2. Fetches all users who have a Google OAuth account linked.
3. Calls `syncGoogleGroupMembership(userId, email, "BACKGROUND_SYNC")` for each.
4. Updates `ServerSettings.googleLastSyncAt` and `googleLastSyncStatus`.
5. Returns a summary: `{ synced: N, errors: N }`.

Rate limiting: calls to the Google API are spaced 100ms apart to avoid quota exhaustion.

---

## 7. Admin UI

### 7.1 Admin Settings Panel — New "Google Workspace" Card

A new card is added to `/settings/admin` below the existing AI settings card.

**Fields:**
- Enable/disable toggle ("Google Workspace Provisioning")
- Service Account JSON (textarea, stored encrypted, masked after save — shows only `[credential saved]`)
- Workspace Domain (text input, e.g. `acme.com`)
- Admin Email to impersonate (text input)
- Sync Interval (number input, hours, default 24)
- "Test Connection" button — calls `POST /api/admin/google-sync/test`, shows success or error inline
- "Sync Now" button — triggers the full sync immediately, shows spinner + result

**Last sync status display:**
```
Last synced: March 14, 2026 at 6:00 AM  ✓ OK
             (or)  ✗ Error: [message]
```

### 7.2 Group Mapping Table

Below the connection card, a table lists current mappings:

| Google Group | Tandem Team | Default Role | Default Label | Active | Actions |
|---|---|---|---|---|---|
| staff@acme.com | Staff | Member | Staff | ✓ | Edit / Delete |
| eng@acme.com | Engineering | Member | — | ✓ | Edit / Delete |
| leads@acme.com | Engineering | Admin | Tech Lead | ✓ | Edit / Delete |

**Add Mapping** button opens a dialog:
- Google Group Email (text input)
- Tandem Team (dropdown of existing teams)
- Default Role (Member / Admin)
- Default Label (optional text)

Deleting a mapping does **not** remove existing provisioned memberships — it only stops future provisioning from that group. The admin can trigger a full sync afterward if they want removals to cascade.

### 7.3 Provisioning Audit Log

A read-only table at `/settings/admin/provisioning-log` shows recent provisioning events:

| Time | User | Google Group | Team | Action | Source |
|---|---|---|---|---|---|
| 2026-03-14 08:32 | jane@acme.com | staff@acme.com | Staff | Added | Sign-in |
| 2026-03-14 06:00 | bob@acme.com | eng@acme.com | Engineering | Skipped | Background |
| 2026-03-13 14:10 | alice@acme.com | leads@acme.com | Engineering | Removed | Sign-in |

Filterable by action type. Paginated. Events older than 90 days are purged by the existing data retention job.

---

## 8. API Surface

```
Google Workspace Admin:
  GET    /api/admin/google-workspace          Get current config (credentials masked)
  PATCH  /api/admin/google-workspace          Save credentials, domain, admin email, sync interval
  POST   /api/admin/google-workspace/test     Test connection, return { ok: true } or { error: string }
  POST   /api/admin/google-workspace/sync     Trigger immediate full sync (admin-only)
  GET    /api/admin/google-workspace/sync     Alias for sync status

  POST   /api/admin/google-sync              Internal route for systemd timer (bearer token auth)

Group Mappings:
  GET    /api/admin/google-group-mappings     List all mappings
  POST   /api/admin/google-group-mappings     Create mapping
  PATCH  /api/admin/google-group-mappings/:id Update (role, label, isActive)
  DELETE /api/admin/google-group-mappings/:id Delete mapping

Audit:
  GET    /api/admin/provisioning-log          List events, supports ?action=&limit=&before=
```

All routes require `isAdmin: true` session, except the sync timer route which uses bearer token.

---

## 9. Environment Variables

```bash
# Google Workspace Provisioning (managed via Admin Settings UI, not .env)
# Credentials are stored encrypted in ServerSettings — not in environment variables.
# Only the sync secret lives in .env:
TANDEM_SYNC_SECRET="generate-a-random-string-at-least-32-characters"
```

The `.env.example` gets one new entry with a comment explaining the timer setup.

---

## 10. Design Decisions

**Service Account + Domain-Wide Delegation, not per-user OAuth consent.**
This is the standard approach for enterprise Google Workspace integrations. It requires a one-time admin setup but means users never see an extra consent screen just for provisioning. The alternative (requesting `admin.directory.group.member.readonly` in the user's own OAuth flow) requires the user to have admin privileges themselves — that's the wrong model for employee onboarding.

**Fire-and-forget on sign-in.**
The Google API call must never block authentication. A network timeout or quota error logs to the audit trail and retries on the next background sync. The user always gets in.

**Only manage what provisioning created.**
`provisionedBy: "google_workspace"` is the sentinel. The sync never touches manually-managed memberships. This prevents the system from undoing deliberate admin decisions (e.g., promoting someone to team admin manually while they're a Member in the Google Group).

**Auto-remove on group departure.**
Consistent with the principle that Tandem team membership mirrors Google Group membership for provisioned users. Manual override is always available — just add them back manually (without the `provisionedBy` field).

**Mappings are not deleted when a group is removed.**
Admins may want to temporarily disable a mapping (`isActive: false`) without losing the configuration. Deletion of a mapping stops future provisioning from that group but does not cascade to existing memberships. A sync can be triggered manually if needed.

---

## 11. What We Don't Build (v1)

- **Google Directory user creation.** Tandem does not create Google Workspace users. It only reads group memberships.
- **SCIM provisioning.** Full SCIM protocol support is a separate, larger spec. This bridge covers the 90% use case with far less complexity.
- **Nested Google Group resolution.** If Group A is a member of Group B, Tandem reads direct memberships only. The Google Admin Directory API can resolve transitive membership — that's a v1.1 enhancement if customers need it.
- **Role escalation from Google.** A user in a Google Group always gets the `defaultRole` from the mapping. The sync does not escalate an existing MEMBER to ADMIN — that's a manual action in Tandem.
- **Other OAuth providers.** Google Workspace only. Microsoft Entra ID (Azure AD) group sync is a separate spec.
- **Provisioning for non-Google sign-ins.** If a user signs in via credentials or Apple, provisioning does not run. They must use Google OAuth for auto-provisioning to work.

---

## 12. Roadmap Placement

**v1.2** — ships alongside Team Hierarchy and Decision Proposals.

The feature depends on:
- Teams (v1.1 — flat) being in production ✓
- `ServerSettings` encryption pattern (already exists) ✓
- Data retention / audit log pattern (already exists) ✓

No new infrastructure required beyond the systemd timer, which managed hosting customers get automatically as part of the Dedicated setup. Community tier customers will need to configure the timer themselves (documented in the self-hosted setup guide) or rely on sign-in-triggered sync alone.
