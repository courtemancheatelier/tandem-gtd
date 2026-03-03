# Flat Teams v1.1 — Requirements Specification

**Version:** 1.1
**Date:** February 21, 2026
**Status:** Implementation-ready
**Depends on:** `docs/specs/TEAMS.md` (parent spec)

---

## 1. Overview

Flat Teams v1.1 adds persistent groups of users that can own shared projects. A Team is a named group with members, roles, and optional display labels. Teams own projects — all team members automatically see team projects without individual `ProjectMember` invitations.

**Scope boundary:** `parentTeamId` exists in the schema but is always `null`. No hierarchy traversal, no ancestor walks, no org chart. Hierarchy ships in v1.2.

### 1.1 Goals

1. Users can create teams and invite other users on the same server
2. Team projects are automatically visible to all team members
3. The "Do Now" page shows tasks from all sources (personal + team + shared) with scope filter pills
4. Existing personal projects and `ProjectMember` sharing continue to work unchanged
5. No data migration — teams are purely additive

### 1.2 Non-Goals (deferred to v1.2+)

- Team hierarchy / nesting (`parentTeamId` always null)
- Membership inheritance from parent teams
- Admin inheritance for structure management
- Org chart / tree view
- Re-parenting teams
- Depth limit enforcement
- Notification scope preferences
- Email-based invitations to users not on the server

---

## 2. Schema Changes

### 2.1 New Enum: `TeamRole`

```prisma
enum TeamRole {
  ADMIN   // Can manage members, update/delete team, create team projects
  MEMBER  // Can view team projects, complete assigned tasks, add tasks
}
```

### 2.2 New Model: `Team`

```prisma
model Team {
  id            String   @id @default(cuid())
  name          String   // e.g. "Camping Crew", "Courtemanche Twins"
  description   String?  // Optional purpose/mission
  icon          String?  // Emoji or icon identifier

  // Hierarchy — always null in v1.1, enabled in v1.2
  parentTeamId  String?  @map("parent_team_id")
  parentTeam    Team?    @relation("TeamHierarchy", fields: [parentTeamId], references: [id], onDelete: SetNull)
  childTeams    Team[]   @relation("TeamHierarchy")

  // Ownership
  createdById   String   @map("created_by_id")
  createdBy     User     @relation("TeamsCreated", fields: [createdById], references: [id])

  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  // Relations
  members       TeamMember[]
  projects      Project[]
  inviteLinks   TeamInviteLink[]

  @@index([parentTeamId])
  @@index([createdById])
  @@map("teams")
}
```

### 2.3 New Model: `TeamMember`

```prisma
model TeamMember {
  id       String   @id @default(cuid())
  teamId   String   @map("team_id")
  userId   String   @map("user_id")
  role     TeamRole @default(MEMBER)
  label    String?  // Human-readable title: "Treasurer", "Camp Chef"
  joinedAt DateTime @default(now()) @map("joined_at")

  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId])
  @@map("team_members")
}
```

### 2.4 New Model: `TeamInviteLink`

```prisma
model TeamInviteLink {
  id        String   @id @default(cuid())
  teamId    String   @map("team_id")
  token     String   @unique  // crypto.randomUUID() or similar
  createdById String @map("created_by_id")
  expiresAt DateTime @map("expires_at")
  maxUses   Int?     @map("max_uses")  // null = unlimited
  useCount  Int      @default(0) @map("use_count")
  revokedAt DateTime? @map("revoked_at")

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  createdBy User     @relation(fields: [createdById], references: [id])

  @@index([token])
  @@index([teamId])
  @@map("team_invite_links")
}
```

### 2.5 Modified Model: `Project`

Add optional team ownership:

```prisma
model Project {
  // ... existing fields ...

  teamId    String?  @map("team_id")
  team      Team?    @relation(fields: [teamId], references: [id], onDelete: SetNull)

  @@index([teamId])
}
```

### 2.6 Modified Model: `User`

Add team relations:

```prisma
model User {
  // ... existing fields ...

  teamMemberships  TeamMember[]
  teamsCreated     Team[]           @relation("TeamsCreated")
  teamInviteLinks  TeamInviteLink[]
}
```

### 2.7 Migration

Run `npx prisma migrate dev --name add-flat-teams` to generate and apply the migration. This is purely additive — no existing data is affected.

---

## 3. Permission Logic

### 3.1 New Service: `src/lib/services/team-service.ts`

Follow the existing service pattern (transactions, `ActorContext`, event writing). Functions:

#### `canUserAccessProject(userId: string, projectId: string): Promise<boolean>`

Decision tree:
1. **Owner check:** `project.userId === userId` → `true`
2. **Team check:** If `project.teamId` is set, check if user is a direct member of that team → `true`/`false`
3. **Shared check:** If `project.isShared`, check `ProjectMember` for userId → `true`/`false`
4. **Default:** `false`

Note: In v1.1, `isUserInTeamOrAncestor()` is just a direct membership lookup — no ancestor walk.

```typescript
async function isUserInTeamOrAncestor(userId: string, teamId: string): Promise<boolean> {
  // v1.1: direct membership only, no hierarchy traversal
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  return !!membership;
}
```

#### `getAccessibleProjects(userId: string, options?): Promise<Project[]>`

Single query returning all projects the user can see:

```typescript
const teamMemberships = await prisma.teamMember.findMany({
  where: { userId },
  select: { teamId: true },
});
const teamIds = teamMemberships.map(m => m.teamId);

return prisma.project.findMany({
  where: {
    OR: [
      { userId },                                     // Own projects
      { teamId: { in: teamIds } },                    // Team projects
      { members: { some: { userId } } },              // Shared projects (ProjectMember)
    ],
    // ...additional filters (status, areaId, etc.)
  },
});
```

#### Team CRUD functions

```typescript
async function createTeam(userId: string, data: CreateTeamInput): Promise<Team>
  // Creates team + TeamMember(role=ADMIN) for creator in one transaction

async function updateTeam(teamId: string, userId: string, data: UpdateTeamInput): Promise<Team>
  // Requires ADMIN role

async function deleteTeam(teamId: string, userId: string): Promise<void>
  // Requires ADMIN role. Cascade deletes TeamMembers. Projects get teamId set to null (SetNull).

async function getTeamWithDetails(teamId: string, userId: string): Promise<TeamDashboardData>
  // Returns team + members + projects + recent activity. Requires membership.

async function addMember(teamId: string, userId: string, targetUserId: string, role: TeamRole, label?: string): Promise<TeamMember>
  // Requires ADMIN role. Prevents duplicate membership (unique constraint).

async function updateMember(teamId: string, userId: string, targetUserId: string, updates: { role?: TeamRole; label?: string }): Promise<TeamMember>
  // Requires ADMIN role. Cannot demote the last ADMIN.

async function removeMember(teamId: string, userId: string, targetUserId: string): Promise<void>
  // Requires ADMIN role. Cannot remove the last ADMIN. Members can remove themselves.

async function generateInviteLink(teamId: string, userId: string, expiresInDays?: number, maxUses?: number): Promise<TeamInviteLink>
  // Requires ADMIN role. Default expiry: 7 days.

async function redeemInviteLink(token: string, userId: string): Promise<TeamMember>
  // Validates: not expired, not revoked, use count < max. Creates TeamMember(role=MEMBER).
```

### 3.2 Update Existing Project Queries

All places that query projects filtered by `userId` must be updated to use `getAccessibleProjects()` or an equivalent `OR` clause. Affected locations:

1. `GET /api/projects` — currently filters `where: { userId }`. Must include team and shared projects.
2. `GET /api/tasks/available` (do-now data) — tasks from team projects must appear if the user is a team member.
3. `GET /api/projects/[id]` — must check `canUserAccessProject()` instead of just `project.userId === userId`.
4. Task operations in team projects — any team member can create/complete tasks in team projects. Assignment (`assignedToId`) should be limited to team members.

---

## 4. Validation Schemas

### 4.1 New File: `src/lib/validations/team.ts`

```typescript
import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(), // emoji or icon key
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  label: z.string().max(100).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  label: z.string().max(100).nullable().optional(),
});

export const generateInviteLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(100).nullable().optional(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type GenerateInviteLinkInput = z.infer<typeof generateInviteLinkSchema>;
```

### 4.2 Modified: `src/lib/validations/project.ts`

Add `teamId` to `createProjectSchema`:

```typescript
export const createProjectSchema = z.object({
  // ... existing fields ...
  teamId: z.string().optional(), // null/omitted = personal project
});
```

---

## 5. API Endpoints

All endpoints follow existing patterns: `getCurrentUserId()` auth check, Zod validation, dynamic service imports, `ActorContext` with `source: "MANUAL"`.

### 5.1 Team CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/teams` | Authenticated user | Create team. Creator becomes ADMIN. |
| `GET` | `/api/teams` | Authenticated user | List teams the user is a member of. Include member count and user's role. |
| `GET` | `/api/teams/[id]` | Team member | Team dashboard: members, projects, recent activity. |
| `PATCH` | `/api/teams/[id]` | Team ADMIN | Update name, description, icon. |
| `DELETE` | `/api/teams/[id]` | Team ADMIN | Delete team. Projects get `teamId: null`. |

### 5.2 Team Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/teams/[id]/members` | Team ADMIN | Add user to team. Body: `{ userId, role, label? }`. |
| `PATCH` | `/api/teams/[id]/members/[uid]` | Team ADMIN | Update role/label. |
| `DELETE` | `/api/teams/[id]/members/[uid]` | Team ADMIN or self | Remove member. |

### 5.3 Invite Links

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/teams/[id]/invite-link` | Team ADMIN | Generate invite link with expiry. Returns `{ token, expiresAt, url }`. |
| `POST` | `/api/teams/invite/[token]` | Authenticated user | Redeem invite link. Validates expiry/revocation/maxUses. Creates TeamMember. |

### 5.4 Modified Endpoints

**`POST /api/projects`** — Accept optional `teamId`. Validate that the user is a member of the specified team. If `teamId` is provided, the project is a team project.

**`GET /api/projects`** — Return all accessible projects (own + team + shared). Include `team` relation in response for team projects.

**`GET /api/projects/[id]`** — Use `canUserAccessProject()` instead of `project.userId === userId` ownership check.

**`GET /api/tasks/available`** — Add optional `scope` query parameter:

| Value | Behavior |
|-------|----------|
| (omitted) | All tasks from accessible projects |
| `personal` | Tasks from projects where `teamId IS NULL` and owned by user |
| `{teamId}` | Tasks from projects owned by that team |
| `personal,{teamId}` | OR of personal + specific team |

### 5.5 API Response Shapes

**Team list item** (GET /api/teams):
```typescript
{
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  memberCount: number;
  myRole: "ADMIN" | "MEMBER";
  createdAt: string;
}
```

**Team dashboard** (GET /api/teams/[id]):
```typescript
{
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdBy: { id: string; name: string };
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    image: string | null;
    role: "ADMIN" | "MEMBER";
    label: string | null;
    joinedAt: string;
  }>;
  projects: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    taskCount: number;
    completedTaskCount: number;
  }>;
  recentActivity: Array<{
    type: "task_completed" | "task_created" | "member_joined";
    description: string;
    actorName: string;
    timestamp: string;
  }>;
}
```

---

## 6. UI Components

### 6.1 Team Sidebar Section

**File:** Modify `src/components/layout/nav.tsx`

Add a "Teams" section below the existing nav sections (after "Reflect", before any future "Horizons" section). Fetch teams from `GET /api/teams` client-side.

```
─── Teams ──────────────
👥 Camping Crew
👥 Courtemanche Twins
[+ Create Team]
```

Each team links to `/teams/{id}`. The `[+ Create Team]` button opens a dialog.

### 6.2 Team Dashboard Page

**File:** `src/app/(dashboard)/teams/[id]/page.tsx`

Layout (see TEAMS.md §5.2 for wireframe):
- Header: team icon + name + description + Settings link (admin only)
- Members grid: avatar cards showing name, label, role badge. [+ Invite] button.
- Projects list: team projects with task counts and progress. [+ Project] button.
- Recent activity feed: last 10 events from team projects.

### 6.3 Team Settings Page

**File:** `src/app/(dashboard)/teams/[id]/settings/page.tsx`

Admin-only page (redirect non-admins to team dashboard). Sections:
- Edit team name, description, icon
- Members table with role dropdown and label editing
- Invite member (search users on this server by name/email)
- Generate/manage invite links
- Danger zone: delete team

### 6.4 Project Creation — Team Selector

**File:** Modify existing project creation UI

Add a "Team" dropdown/selector to the project creation form:
- Options: "Personal" (default) + list of user's teams
- When a team is selected, the project's `teamId` is set on creation
- Only show teams where the user is a member

### 6.5 Scope Filter Pills on Do Now Page

**File:** Modify `src/components/tasks/FilterBar.tsx`

Add a scope filter row above or alongside existing context filters:

```
[All] [👤 Personal] [🏕️ Camping Crew] [🎵 Tango]
```

- "All" is the default (no filtering)
- Pills are toggle filters with OR logic (multiple can be active)
- "Personal" = tasks from projects where `teamId IS NULL`
- Team pills are dynamically built from the user's team memberships
- Scope filtering happens client-side (same pattern as context/energy/time)

**Props additions to FilterBar:**

```typescript
interface FilterBarProps {
  // ... existing props ...
  teams: Array<{ id: string; name: string; icon: string | null }>;
  selectedScopes: string[];  // ["personal", teamId1, ...] or [] for "All"
  onScopeChange: (scopes: string[]) => void;
}
```

### 6.6 Source Badges on Task Cards

**File:** Modify `src/components/tasks/TaskCard.tsx`

When a task's project has a `teamId`, show a small team badge before the project name:

```
☐ Call venue about Saturday setup    10m  🟡 Low
  └ 🏕️ Camping Crew · August Trip · @phone
```

- Personal tasks: subtle `👤` icon or no extra badge
- Team tasks: team icon + team name as a small pill
- The task prop type gains `project.team?: { id: string; name: string; icon: string | null }`

### 6.7 QuickView Scope Field

**File:** Modify `src/components/layout/quick-view-types.ts`

Add optional `scope` to the `params` record. Existing QuickViews are unaffected (scope defaults to "all").

```typescript
// params can now include: context, energy, maxTime, scope
// scope value: "personal" | teamId | undefined (all)
```

Update `QuickViewManager` to include a "Scope" dropdown alongside Context, Energy, and Max Time.

---

## 7. Invitation Flow

### 7.1 Same-Server Invite (v1.1 — simplified)

For v1.1, adding a member is immediate — no accept/decline flow:

1. Admin searches for users on the server by name or email
2. Admin selects user, sets role (ADMIN/MEMBER), optional label
3. `POST /api/teams/{id}/members` — user is immediately added
4. User sees the team in their sidebar on next page load

**User search endpoint needed:** `GET /api/users/search?q=<query>` — returns users matching name/email. Only available to authenticated users. Limit results to 10. Exclude users already in the team.

### 7.2 Invite Link

1. Admin clicks "Generate Invite Link" on team settings
2. `POST /api/teams/{id}/invite-link` creates a `TeamInviteLink` with token, expiry (default 7 days), optional max uses
3. Returns a URL like `/teams/invite/{token}`
4. Anyone with the URL who is authenticated can redeem it via `POST /api/teams/invite/{token}`
5. Redemption creates a `TeamMember(role=MEMBER)` if: token is valid, not expired, not revoked, useCount < maxUses, user not already a member

### 7.3 Invite Link Redemption Page

**File:** `src/app/(dashboard)/teams/invite/[token]/page.tsx`

- Fetches invite link details (team name, icon, expiry)
- Shows: "You've been invited to join {team name}" with a "Join Team" button
- On click, calls `POST /api/teams/invite/{token}`
- On success, redirects to team dashboard
- Error states: expired, revoked, already a member, maxed out

---

## 8. Edge Cases and Error Handling

### 8.1 Team Management

| Scenario | Behavior |
|----------|----------|
| Delete team with projects | Projects get `teamId: null` (become personal projects owned by their original `userId`). Tasks are unaffected. |
| Last ADMIN tries to leave | Reject with 400: "Cannot remove the last admin. Promote another member first." |
| Last ADMIN demoted to MEMBER | Reject with 400: "Cannot demote the last admin." |
| Add user already in team | Reject with 409: "User is already a member of this team." (unique constraint) |
| Non-member accesses team | Return 404 (not 403, to avoid leaking team existence). |
| Non-admin tries admin action | Return 403: "Only team admins can perform this action." |
| Create project with invalid teamId | Return 400: "Team not found or you are not a member." |
| User removed from team | They lose access to team projects immediately. Tasks assigned to them remain assigned (not unassigned). |

### 8.2 Invite Links

| Scenario | Behavior |
|----------|----------|
| Expired link | Return 410: "This invite link has expired." |
| Revoked link | Return 410: "This invite link has been revoked." |
| Max uses reached | Return 410: "This invite link has reached its maximum uses." |
| Already a member | Return 409: "You are already a member of this team." |
| Unauthenticated user clicks link | Redirect to sign-in, then back to invite page. |

### 8.3 Scope Filtering

| Scenario | Behavior |
|----------|----------|
| User has no teams | Scope pills show only "All" and "Personal" (which are equivalent). |
| Team is deleted while user has scope filter active | The filter silently drops the invalid teamId. Tasks from that team's projects (now personal) appear under "Personal". |
| Task moved to different project (different team) | Scope changes automatically — scope is always derived from `project.teamId`. |

### 8.4 Concurrent Access

| Scenario | Behavior |
|----------|----------|
| Two admins remove each other simultaneously | The unique constraint and "last admin" check prevent an inconsistent state. One operation will succeed, the other will fail. |
| User completes task while being removed from team | The task completion succeeds (the operation started while they had access). Subsequent operations will fail access checks. |

---

## 9. Acceptance Criteria

### 9.1 Schema & Migration

- [ ] `TeamRole` enum exists with `ADMIN` and `MEMBER` values
- [ ] `Team` model exists with all fields from §2.2, including `parentTeamId` (nullable, unused)
- [ ] `TeamMember` model exists with `@@unique([teamId, userId])`
- [ ] `TeamInviteLink` model exists with `token` unique index
- [ ] `Project` model has `teamId` nullable field with `@@index([teamId])`
- [ ] `User` model has `teamMemberships`, `teamsCreated`, and `teamInviteLinks` relations
- [ ] Migration applies cleanly to an existing database with no data loss

### 9.2 Team CRUD

- [ ] POST /api/teams creates a team and adds the creator as ADMIN
- [ ] GET /api/teams returns only teams the user is a member of
- [ ] GET /api/teams/[id] returns team details (members, projects, activity) — only for members
- [ ] PATCH /api/teams/[id] updates team fields — only for ADMINs
- [ ] DELETE /api/teams/[id] deletes the team — only for ADMINs
- [ ] Non-members get 404 on all team endpoints

### 9.3 Team Members

- [ ] POST /api/teams/[id]/members adds a user — only for ADMINs
- [ ] PATCH /api/teams/[id]/members/[uid] updates role/label — only for ADMINs
- [ ] DELETE /api/teams/[id]/members/[uid] removes a member — for ADMINs or self
- [ ] Cannot remove or demote the last ADMIN
- [ ] Duplicate membership returns 409

### 9.4 Invite Links

- [ ] POST /api/teams/[id]/invite-link generates a token with expiry — ADMINs only
- [ ] POST /api/teams/invite/[token] creates a MEMBER if token is valid
- [ ] Expired, revoked, or maxed-out tokens return 410
- [ ] Already-a-member returns 409

### 9.5 Permission & Access

- [ ] `canUserAccessProject()` returns true for: owner, team member, ProjectMember
- [ ] `getAccessibleProjects()` returns own + team + shared projects in a single query
- [ ] GET /api/projects returns team projects alongside personal projects
- [ ] GET /api/projects/[id] uses `canUserAccessProject()` for authorization
- [ ] Creating a project with `teamId` requires team membership
- [ ] Users removed from a team lose access to its projects

### 9.6 Scope Filtering

- [ ] GET /api/tasks/available accepts `?scope=personal`, `?scope={teamId}`, `?scope=personal,{teamId}`
- [ ] Omitted scope returns all accessible tasks
- [ ] FilterBar shows scope pills derived from user's team memberships
- [ ] Multiple scopes can be active (OR logic)
- [ ] Scope filter state persists via URL search params

### 9.7 UI

- [ ] Teams section appears in nav sidebar with team list
- [ ] Team dashboard page shows members, projects, recent activity
- [ ] Team settings page is admin-only
- [ ] Project creation form includes team selector
- [ ] Task cards show team source badge for team project tasks
- [ ] QuickView params support optional `scope` field
- [ ] Invite link redemption page works for authenticated users

### 9.8 Data Integrity

- [ ] Deleting a team sets `teamId: null` on its projects (does not delete projects)
- [ ] Deleting a team cascade-deletes its TeamMembers and TeamInviteLinks
- [ ] Removing a user from a team does not unassign their tasks
- [ ] The `parentTeamId` field is always null (enforced at the API level for v1.1)

---

## 10. File Manifest

New files to create:

| File | Purpose |
|------|---------|
| `prisma/migrations/XXXXXX_add_flat_teams/migration.sql` | Auto-generated by `prisma migrate dev` |
| `src/lib/validations/team.ts` | Zod schemas for team inputs |
| `src/lib/services/team-service.ts` | Team business logic |
| `src/app/api/teams/route.ts` | POST + GET teams |
| `src/app/api/teams/[id]/route.ts` | GET + PATCH + DELETE team |
| `src/app/api/teams/[id]/members/route.ts` | POST add member |
| `src/app/api/teams/[id]/members/[uid]/route.ts` | PATCH + DELETE member |
| `src/app/api/teams/[id]/invite-link/route.ts` | POST generate invite link |
| `src/app/api/teams/invite/[token]/route.ts` | POST redeem invite link |
| `src/app/api/users/search/route.ts` | GET search users (for invite flow) |
| `src/app/(dashboard)/teams/[id]/page.tsx` | Team dashboard page |
| `src/app/(dashboard)/teams/[id]/settings/page.tsx` | Team settings page |
| `src/app/(dashboard)/teams/invite/[token]/page.tsx` | Invite link redemption page |

Files to modify:

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add Team, TeamMember, TeamInviteLink, TeamRole; modify Project, User |
| `src/lib/validations/project.ts` | Add `teamId` to `createProjectSchema` |
| `src/app/api/projects/route.ts` | GET uses `getAccessibleProjects()`; POST accepts `teamId` |
| `src/app/api/projects/[id]/route.ts` | GET/PATCH/DELETE use `canUserAccessProject()` |
| `src/app/api/tasks/available/route.ts` | Add `scope` query param support |
| `src/components/layout/nav.tsx` | Add Teams sidebar section |
| `src/components/tasks/FilterBar.tsx` | Add scope filter pills |
| `src/components/tasks/TaskCard.tsx` | Add team source badge |
| `src/components/layout/quick-view-types.ts` | Add `scope` to params |
| `src/components/layout/QuickViewManager.tsx` | Add scope dropdown |
