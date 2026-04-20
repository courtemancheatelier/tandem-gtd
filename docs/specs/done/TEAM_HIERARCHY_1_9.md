# Tandem — Team Hierarchy v1.9 (Scoped Addition)

**Date:** March 2026  
**Extends:** `docs/specs/TEAMS.md` (flat teams)  
**Status:** Ready for implementation  
**Release target:** v1.9 (beta)

---

## Overview

This spec adds basic parent/child team relationships to the flat teams already shipping in v1.9. The goal is to establish the structural foundation — an org-level team that owns child department or group teams — without building out full permission inheritance, membership cascading, or org chart views. Those come in a future release.

**What ships in v1.9:**
- `parentTeamId` active in schema (was dormant)
- Create a child team under a parent team
- Display parent/child relationship in the sidebar and team list
- Basic breadcrumb showing a child team's parent
- Guard: child teams cannot themselves have children yet (depth limit = 1 for now)

**What is explicitly deferred:**
- Membership inheritance (parent members auto-seeing child team projects)
- Admin inheritance
- Re-parenting (moving a team to a different parent)
- Org chart / tree view UI
- Depth beyond 1 level (grandchild teams)
- Permission resolution walking the ancestor chain

---

## 1. Schema Change

The `parentTeamId` field already exists in the `Team` model per `TEAMS.md`. No migration is needed beyond activating the constraint and removing any code that forces it to null.

Confirm the following is in `schema.prisma` and active:

```prisma
model Team {
  id           String   @id @default(cuid())
  name         String
  description  String?
  icon         String?

  parentTeamId String?  @map("parent_team_id")
  parentTeam   Team?    @relation("TeamHierarchy", fields: [parentTeamId], references: [id], onDelete: SetNull)
  childTeams   Team[]   @relation("TeamHierarchy")

  createdById  String   @map("created_by_id")
  createdBy    User     @relation("TeamsCreated", fields: [createdById], references: [id])

  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  members      TeamMember[]
  projects     Project[]

  @@index([parentTeamId])
  @@index([createdById])
  @@map("teams")
}
```

---

## 2. Depth Enforcement (v1.9 Limit)

For v1.9, enforce a maximum depth of **1** (one level of children, no grandchildren). This is a temporary constraint lifted in the next release.

```typescript
// src/lib/validations/team.ts

export async function validateTeamDepth(
  parentTeamId: string | null
): Promise<{ valid: boolean; reason?: string }> {
  if (!parentTeamId) return { valid: true }; // top-level is always fine

  // Check if the intended parent is itself a child team
  const parent = await prisma.team.findUnique({
    where: { id: parentTeamId },
    select: { parentTeamId: true },
  });

  if (!parent) return { valid: false, reason: "Parent team not found." };

  if (parent.parentTeamId !== null) {
    return {
      valid: false,
      reason:
        "Child teams cannot have their own child teams yet. This will be available in a future release.",
    };
  }

  return { valid: true };
}
```

---

## 3. API Changes

### 3.1 Create Team — Accept `parentTeamId`

`POST /api/teams`

Update the request schema to accept an optional `parentTeamId`:

```typescript
// src/lib/validations/team.ts

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  parentTeamId: z.string().cuid().optional(),
});
```

In the route handler, run `validateTeamDepth(parentTeamId)` before creating. Return a `400` with the reason string if invalid.

The user must be an ADMIN of the parent team to create a child team under it.

### 3.2 List Teams — Include Parent/Child Relationship

`GET /api/teams`

Update the response to include `parentTeamId`, `parentTeam` (name + icon only), and a `childTeams` array (id + name + icon + member count):

```typescript
type TeamListItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parentTeamId: string | null;
  parentTeam: { id: string; name: string; icon: string | null } | null;
  childTeams: { id: string; name: string; icon: string | null; memberCount: number }[];
  memberCount: number;
  projectCount: number;
  myRole: "ADMIN" | "MEMBER";
  myLabel: string | null;
};
```

### 3.3 Get Team — Include Hierarchy Context

`GET /api/teams/:id`

Include the same parent and childTeams fields. This powers the breadcrumb and the child team list on the team dashboard.

---

## 4. UI Changes

### 4.1 Sidebar — Grouped by Parent

Child teams nest visually under their parent in the left rail. Indent child teams by one level:

```
─── Teams ──────────────────

👥 Acme Corp                     ← parent team
   ├─ 👥 Engineering              ← child team
   └─ 👥 Marketing                ← child team
👥 Camping Crew                   ← flat team (no children)
```

Parent teams with children are collapsible. Collapsed by default if the user is not a member of the parent (visibility inherited from membership, not hierarchy — in v1.9, no inheritance yet).

### 4.2 Team Dashboard — Child Teams Section

If a team has child teams, show a **Groups** section on the dashboard below the Members section:

```
┌──────────────────────────────────────────────────────────┐
│  👥 Acme Corp                             [⚙️ Settings]  │
│                                                          │
│  Members                                                 │
│  [ list of org-level members ]           [+ Invite]      │
│                                                          │
│  Groups                                  [+ Add Group]   │
│  ┌──────────────────┐ ┌──────────────────┐              │
│  │ 👥 Engineering   │ │ 👥 Marketing     │              │
│  │ 4 members        │ │ 3 members        │              │
│  │ 6 projects       │ │ 2 projects       │              │
│  └──────────────────┘ └──────────────────┘              │
└──────────────────────────────────────────────────────────┘
```

Each group card links to that child team's dashboard. The **+ Add Group** button opens the new team creation flow with `parentTeamId` pre-set.

### 4.3 Child Team Dashboard — Parent Breadcrumb

Child team dashboards show a breadcrumb above the team name:

```
Acme Corp  >  Engineering
```

Clicking the parent name navigates to the parent team dashboard.

### 4.4 Create Team Flow — Parent Option

When creating a new team, if the user is an ADMIN of any existing teams, show an optional **"This group belongs to..."** dropdown. Selecting a parent sets `parentTeamId`. Leaving it blank creates a top-level team.

If the user arrives via the **+ Add Group** button on a parent team dashboard, the parent is pre-selected and the field is read-only.

---

## 5. Permissions (v1.9 — No Inheritance)

In v1.9, team membership does **not** cascade. Being a member of "Acme Corp" does not automatically grant visibility into "Engineering" projects. Members must be explicitly added to each team.

This is the primary behavior to upgrade in the next release. For now, document this clearly in the UI:

> "Members of a parent group don't automatically see this group's projects. Add them directly to grant access."

Show this note as a subtle callout on child team dashboards when the child team has fewer members than its parent.

---

## 6. Error States

| Scenario | Error message |
|---|---|
| Creating a child under a child (depth > 1) | "Child groups can't have their own groups yet. This is coming in a future update." |
| Non-admin trying to create a child team | "Only admins of [Parent Team] can add groups to it." |
| Deleting a parent team that has children | "Remove or reassign all groups under [Team Name] before deleting it." |

---

## 7. Out of Scope for v1.9

The following are documented in `TEAMS.md` but explicitly deferred:

- Membership inheritance walking the ancestor chain
- Admin inheritance for child team management
- Re-parenting a team (PATCH `/api/teams/:id/move`)
- Org chart / tree view
- Depth > 1 (grandchild teams)
- Scope filter showing parent + children together in "What Should I Do Now?"
- Notification scope preferences per team level

---

## 8. Test Cases

- [ ] Create a top-level team (parentTeamId null) — succeeds
- [ ] Create a child team under a top-level team — succeeds
- [ ] Attempt to create a child under a child — returns 400 with correct message
- [ ] Non-admin attempts to create a child team under a team — returns 403
- [ ] Team list response includes parentTeam and childTeams fields
- [ ] Sidebar renders parent with indented children
- [ ] Child team dashboard shows breadcrumb with parent name
- [ ] Parent team dashboard shows Groups section with child team cards
- [ ] Deleting a parent with children returns 400 with correct message
- [ ] Deleting a child team succeeds; parent's childTeams list updates
