# Tandem — Teams & Hierarchical Groups Spec Addition

**Date:** February 21, 2026
**Extends:** TANDEM_SPEC.md §6 (Data Model) and §12.3.2 (Multi-User Collaboration)
**Status:** Draft for review

---

## Overview

Teams add a persistent, hierarchical grouping layer above Projects. A Team is a named group of users that can own multiple shared projects. Teams can nest inside other teams via a self-referencing `parentTeamId`, enabling structures from a flat friend group to a full corporate org chart — using the same model.

### The Core Insight

A friend group planning camping, a nonprofit board running a gala, and an engineering department managing a sprint are all the same thing: **a group of people with shared projects, different roles, and a human-readable title that means nothing to the permission system.**

"Treasurer", "Camp Chef", and "VP Engineering" are all just `label: String?` on a `TeamMember`. The system only cares about `TeamRole` (ADMIN vs MEMBER).

---

## 1. Data Model

### 1.1 New Models

```prisma
// ============================================================================
// TEAMS (hierarchical group structure)
// ============================================================================

/// A named group of users that can own shared projects.
/// Self-referencing hierarchy via parentTeamId enables nesting:
///   "Acme Corp" → "Engineering" → "Frontend Team"
model Team {
  id          String   @id @default(cuid())
  name        String   // "Camping Crew", "Board of Directors", "Engineering"
  description String?  // Optional purpose/mission for the group
  icon        String?  // Emoji or icon identifier
  
  // Hierarchy — null means top-level team
  parentTeamId String?  @map("parent_team_id")
  parentTeam   Team?    @relation("TeamHierarchy", fields: [parentTeamId], references: [id], onDelete: SetNull)
  childTeams   Team[]   @relation("TeamHierarchy")
  
  // Ownership
  createdById  String   @map("created_by_id")
  createdBy    User     @relation("TeamsCreated", fields: [createdById], references: [id])
  
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  // Relations
  members      TeamMember[]
  projects     Project[]   // Projects owned by this team
  
  @@index([parentTeamId])
  @@index([createdById])
  @@map("teams")
}

/// Membership in a team with role and optional display label.
model TeamMember {
  id       String   @id @default(cuid())
  teamId   String   @map("team_id")
  userId   String   @map("user_id")
  role     TeamRole @default(MEMBER)
  label    String?  // Human-readable title: "Treasurer", "Camp Chef", "Tech Lead"
  joinedAt DateTime @default(now()) @map("joined_at")
  
  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([teamId, userId])
  @@index([userId])
  @@map("team_members")
}

enum TeamRole {
  ADMIN   // Can manage members, create/archive team projects, manage child teams
  MEMBER  // Can view team projects, complete assigned tasks, add tasks
}
```

### 1.2 Modified Models

**User** gains team relations:

```prisma
model User {
  // ... existing fields ...
  
  // Team collaboration
  teamMemberships  TeamMember[]        // teams user belongs to
  teamsCreated     Team[]    @relation("TeamsCreated")  // teams user created
}
```

**Project** gains optional team ownership:

```prisma
model Project {
  // ... existing fields ...
  
  // Team ownership — null = personal project, set = team project
  teamId    String?  @map("team_id")
  team      Team?    @relation(fields: [teamId], references: [id], onDelete: SetNull)
  
  @@index([teamId])
}
```

### 1.3 How Team Projects Interact with Existing Models

When a project has a `teamId`:

- **All team members automatically have access** — no individual `ProjectMember` invitations needed
- **Tasks** within team projects can be assigned to any team member via existing `assignedToId`
- **Waiting For** auto-generates when assigning tasks, same as before
- **The cascade engine** works identically — team projects are just projects with broader visibility
- **"What Should I Do Now?"** still only shows tasks assigned to the current user (or unassigned tasks in teams they belong to)

The existing `ProjectMember` model **coexists** for one-off project sharing outside of teams. You might share a single project with your brother without creating a whole team.

**Decision tree for project visibility:**

```
Is project.teamId set?
  YES → All members of that team (and ancestor teams) can see it
  NO  → Is project.isShared set?
    YES → Only explicit ProjectMember entries can see it
    NO  → Only the project owner (userId) can see it
```

---

## 2. Hierarchy Rules

### 2.1 Nesting

Teams can nest to arbitrary depth, but practically 2-3 levels covers every real use case:

```
Flat (friend group):
  🏕️ Camping Crew                    ← top-level, no parent
  
Two levels (nonprofit):
  🏛️ Habitat for Humanity Local      ← top-level org
    ├─ 🔨 Build Committee
    ├─ 💰 Fundraising Committee
    └─ 📣 Outreach Committee

Three levels (company):
  🏢 Acme Corp                       ← top-level org
    ├─ ⚙️ Engineering
    │   ├─ Frontend Team
    │   ├─ Backend Team
    │   └─ Platform Team
    ├─ 🎨 Design
    └─ 📊 Marketing
```

### 2.2 Membership Inheritance

**Members of a parent team can see projects in child teams.** This flows downward only:

- A member of "Acme Corp" can see projects in "Engineering" and "Frontend Team"
- A member of "Frontend Team" can only see Frontend Team projects (not Backend, not Acme Corp-level)
- This mirrors how real orgs work: the CEO can see everything, the frontend dev sees their team

**Membership is NOT automatically inherited for task assignment.** You must be an explicit member of a team to be assigned tasks in that team's projects. Parent team members have *visibility* but not *assignability* unless they're also members of the child team. This prevents the CEO from accidentally showing up in the task assignment dropdown for every team.

### 2.3 Admin Inheritance

- A team ADMIN can manage child teams (create, rename, add/remove members)
- A team ADMIN does **not** automatically become ADMIN of child teams — they manage the structure, not the day-to-day
- The creator of a child team becomes its ADMIN

### 2.4 Depth Limit

Enforce a maximum nesting depth of **5 levels** at the application layer. This is generous — most real structures need 2-3. The limit prevents accidental infinite nesting and keeps the permission resolution query bounded.

```typescript
// Validation on team creation
async function validateTeamDepth(parentTeamId: string | null): Promise<boolean> {
  if (!parentTeamId) return true; // top-level is always fine
  
  let depth = 0;
  let currentId: string | null = parentTeamId;
  
  while (currentId && depth < 5) {
    const parent = await prisma.team.findUnique({
      where: { id: currentId },
      select: { parentTeamId: true }
    });
    currentId = parent?.parentTeamId ?? null;
    depth++;
  }
  
  return depth < 5; // Must have room for one more level
}
```

---

## 3. Permission Resolution

### 3.1 Query: "Can this user see this project?"

```typescript
async function canUserAccessProject(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, teamId: true, isShared: true }
  });
  
  if (!project) return false;
  
  // 1. Owner always has access
  if (project.userId === userId) return true;
  
  // 2. Team project — check team membership (including ancestors)
  if (project.teamId) {
    return await isUserInTeamOrAncestor(userId, project.teamId);
  }
  
  // 3. Shared project — check explicit ProjectMember
  if (project.isShared) {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } }
    });
    return !!membership;
  }
  
  // 4. Private project — no access
  return false;
}

// Walk up the team hierarchy to check membership
async function isUserInTeamOrAncestor(userId: string, teamId: string): Promise<boolean> {
  let currentTeamId: string | null = teamId;
  
  while (currentTeamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: currentTeamId, userId } }
    });
    if (membership) return true;
    
    // Check parent team
    const team = await prisma.team.findUnique({
      where: { id: currentTeamId },
      select: { parentTeamId: true }
    });
    currentTeamId = team?.parentTeamId ?? null;
  }
  
  return false;
}
```

### 3.2 Query: "What projects can this user see?"

This is the hot path — called on every page load. Optimize with a single query:

```typescript
async function getAccessibleProjects(userId: string) {
  // Get all team IDs the user is a member of
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true }
  });
  const directTeamIds = memberships.map(m => m.teamId);
  
  // Expand to include all descendant teams
  const allTeamIds = await expandTeamDescendants(directTeamIds);
  
  return prisma.project.findMany({
    where: {
      OR: [
        { userId },                                    // Own projects
        { teamId: { in: allTeamIds } },                // Team projects
        { members: { some: { userId } } },             // Shared projects
      ]
    }
  });
}

// Get all descendant team IDs (children, grandchildren, etc.)
async function expandTeamDescendants(teamIds: string[]): Promise<string[]> {
  const allIds = new Set(teamIds);
  let frontier = [...teamIds];
  
  while (frontier.length > 0) {
    const children = await prisma.team.findMany({
      where: { parentTeamId: { in: frontier } },
      select: { id: true }
    });
    frontier = children.map(c => c.id).filter(id => !allIds.has(id));
    frontier.forEach(id => allIds.add(id));
  }
  
  return Array.from(allIds);
}
```

**Performance note:** For small deployments (family/friends, <50 users), this is negligible. For larger deployments, cache the team hierarchy in memory and invalidate on team structure changes (which are rare).

---

## 4. Concrete Examples

### 4.1 Friend Group — Flat

```
Jason creates team "Camping Crew" (no parent)
  → Jason: ADMIN, label: "Trip Organizer"
  → Mike: MEMBER, label: "Camp Chef"
  → Sarah: MEMBER, label: "Gear Manager"
  → Dave: MEMBER, label: "Navigation"

Team projects:
  🔵 "August Camping Trip"    → tasks assigned across all 4
  🔵 "Gear Inventory"         → mostly Sarah's tasks
  ✅ "Permit Research"         → completed by Dave
```

Everyone sees all three projects. Jason's "What Should I Do Now?" only shows tasks assigned to him. The labels are just fun — nobody needs "ADMIN" powers except Jason (who handles logistics).

### 4.2 Nonprofit — Two Levels

```
Lisa creates team "Habitat Local Chapter" (no parent)
  → Lisa: ADMIN, label: "Chapter President"
  → Tom: ADMIN, label: "Vice President"

  Child team: "Build Committee" (parent: Habitat Local)
    → Tom: ADMIN, label: "Build Director"
    → Maria: MEMBER, label: "Site Lead"
    → Jake: MEMBER, label: "Volunteer Coordinator"
    
  Child team: "Fundraising Committee" (parent: Habitat Local)
    → Lisa: ADMIN, label: "Fundraising Chair"
    → Priya: MEMBER, label: "Event Planner"
    → Sam: MEMBER, label: "Donor Relations"
    
  Child team: "Outreach" (parent: Habitat Local)
    → Tom: MEMBER, label: "Outreach Lead"
    → Kim: MEMBER, label: "Social Media"

Project visibility:
  Lisa (member of top-level) → sees ALL projects across all committees
  Tom (member of top-level + Build + Outreach) → sees all projects
  Maria (member of Build only) → sees only Build Committee projects
  Priya (member of Fundraising only) → sees only Fundraising projects
```

### 4.3 Small Company — Three Levels

```
Acme Corp (top-level)
  → CEO: ADMIN, label: "CEO"
  → COO: ADMIN, label: "COO"
  
  Engineering (parent: Acme Corp)
    → CTO: ADMIN, label: "CTO"
    → VP Eng: MEMBER, label: "VP Engineering"
    
    Frontend Team (parent: Engineering)
      → FE Lead: ADMIN, label: "Tech Lead"
      → Dev 1: MEMBER, label: "Senior Dev"
      → Dev 2: MEMBER, label: "Junior Dev"
      
    Backend Team (parent: Engineering)
      → BE Lead: ADMIN, label: "Tech Lead"
      → Dev 3: MEMBER, label: "Senior Dev"
      
  Marketing (parent: Acme Corp)
    → Marketing Dir: ADMIN, label: "Director"
    → Designer: MEMBER, label: "Brand Designer"

Project visibility:
  CEO → sees everything (member of top-level)
  CTO → sees all Engineering + child team projects
  FE Lead → sees only Frontend Team projects
  Marketing Dir → sees only Marketing projects
  Designer → sees only Marketing projects
```

### 4.4 Jason's Actual Setup — Mixed Use

```
Personal GTD (no team — private)
  → All of Jason's personal projects, areas, horizons

Courtemanche Twins (flat team)
  → Jason: ADMIN, label: "Jason"
  → Brother: MEMBER, label: "Brother"
  → Shared projects: "Mom's Birthday", "Apartment Stuff"

Tango Community (two levels)
  → Jason: ADMIN, label: "Organizer"
  
  Milonga Planning (parent: Tango Community)
    → Jason: ADMIN
    → DJ: MEMBER, label: "DJ"
    → Venue Contact: MEMBER, label: "Venue"
    
  Workshop Series (parent: Tango Community)
    → Jason: ADMIN, label: "Instructor"
    → Guest Teacher: MEMBER, label: "Guest Instructor"

Courtemanche Atelier (two levels — future)
  → Jason: ADMIN, label: "Founder"
  
  Fashion Line (parent: Atelier)
    → Jason: ADMIN
    → Seamstress: MEMBER, label: "Production"
```

All of this runs on the same server. Jason's personal GTD stays completely private. Each team's projects are only visible to team members. The hierarchy means Jason sees everything across all his teams, but his DJ only sees milonga planning tasks.

---

## 5. UI

### 5.1 Team Sidebar Section

Teams appear in the left rail / navigation, grouped hierarchically:

```
┌──────────────────────────────────┐
│  ☰ Tandem                       │
│                                  │
│  📥 Inbox (3)                    │
│  ⚡ What Should I Do Now?        │
│  📋 Projects                     │
│  🔄 Waiting For                  │
│  💤 Someday/Maybe                │
│  📝 Weekly Review                │
│                                  │
│  ─── Teams ──────────────────    │
│                                  │
│  👥 Camping Crew                 │
│  👥 Courtemanche Twins           │
│  👥 Tango Community              │
│     ├─ Milonga Planning          │
│     └─ Workshop Series           │
│                                  │
│  ─── Areas ──────────────────    │
│  ... (personal areas)            │
└──────────────────────────────────┘
```

### 5.2 Team Dashboard

Clicking a team opens its dashboard:

```
┌──────────────────────────────────────────────────────────┐
│  🏕️ Camping Crew                          [⚙️ Settings] │
│                                                          │
│  Members                                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │  👤 J  │ │  👤 M  │ │  👤 S  │ │  👤 D  │  [+Invite]│
│  │ Jason  │ │  Mike  │ │ Sarah  │ │  Dave  │           │
│  │Organizer│ │  Chef  │ │  Gear  │ │  Nav   │           │
│  └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                          │
│  Projects                                   [+ Project]  │
│  🔵 August Camping Trip      12 tasks, 4 next actions   │
│     You: 3 tasks · Mike: 4 · Sarah: 3 · Dave: 2        │
│  🔵 Gear Inventory           6 tasks, 2 next actions    │
│     You: 1 task · Sarah: 5                              │
│  ✅ Permit Research           Complete                   │
│                                                          │
│  Recent Activity                                         │
│  Sarah completed "Reserve campsite" · 2hr ago            │
│  Mike added "Plan meal schedule" · yesterday             │
│  Dave completed "Download trail maps" · 2 days ago       │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Team Settings (Admin Only)

```
┌──────────────────────────────────────────────────────────┐
│  ⚙️ Camping Crew — Settings                             │
│                                                          │
│  Name: [Camping Crew          ]                          │
│  Icon: [🏕️]                                             │
│  Description: [Annual camping trip planning       ]      │
│                                                          │
│  Members                                                 │
│  ┌──────────────────────────────────────────────┐       │
│  │ Jason     │ Admin  │ Trip Organizer │ [...]   │       │
│  │ Mike      │ Member │ Camp Chef      │ [...]   │       │
│  │ Sarah     │ Member │ Gear Manager   │ [...]   │       │
│  │ Dave      │ Member │ Navigation     │ [...]   │       │
│  └──────────────────────────────────────────────┘       │
│  [+ Invite Member]                                       │
│                                                          │
│  Sub-teams                                               │
│  (none)                              [+ Create Sub-team] │
│                                                          │
│  Danger Zone                                             │
│  [Archive Team]  [Delete Team]                           │
└──────────────────────────────────────────────────────────┘
```

### 5.4 Project Creation — Team Selector

When creating a new project, users choose where it lives:

```
┌──────────────────────────────────────────┐
│  New Project                             │
│                                          │
│  Name: [August Camping Trip        ]     │
│                                          │
│  Owner:                                  │
│  ○ Personal (just me)                    │
│  ○ 👥 Camping Crew                       │
│  ○ 👥 Courtemanche Twins                 │
│  ○ 👥 Tango Community                    │
│     ○ Milonga Planning                   │
│     ○ Workshop Series                    │
│                                          │
│  Type: ○ Sequential ● Parallel ○ Single  │
│                                          │
│  [Create Project]                        │
└──────────────────────────────────────────┘
```

---

## 6. Invitation Flow

### 6.1 Same-Server Users

For users already on the Tandem server:

```
Admin clicks [+ Invite Member]
  → Search by name or email (users on this server)
  → Select user → Set role (Admin/Member) → Set label (optional)
  → User gets in-app notification: "Jason invited you to Camping Crew"
  → User accepts or declines
```

### 6.2 New Users

For people not yet on the server:

```
Admin clicks [+ Invite Member] → [Invite by email]
  → Enter email → Set role → Set label
  → System sends invite email with signup link
  → New user creates account → automatically joins the team
```

### 6.3 Invite Link (for friend groups)

```
Admin clicks [+ Invite Member] → [Copy Invite Link]
  → Generates a time-limited link (7 days default)
  → Anyone with the link can join as MEMBER
  → Admin can set a member cap on the link
  → Link can be revoked at any time
```

---

## 7. How This Integrates with GTD

### 7.1 "What Should I Do Now?" — Unchanged

The primary work surface doesn't change. Team tasks appear alongside personal tasks, filtered the same way:

```
What Should I Do Now?
  Context: @computer  Energy: Any  Time: < 30min

  📋 Review PR for auth module          (Acme Corp → Frontend)  15min  🟢
  📋 Email venue about Saturday setup   (Tango → Milonga)       10min  🟡
  📋 Update camping checklist           (Camping Crew)          20min  🟢
  📋 Process inbox items                (Personal)              15min  🟡
```

Each task shows its team/project lineage for context, but they're all in one unified list filtered by YOUR contexts, energy, and time.

### 7.2 Weekly Review — Team Awareness

The Weekly Review adds a section for team projects:

```
Get Current — Team Projects

🏕️ Camping Crew
  🔵 August Camping Trip — 3 tasks waiting on others
     ⏳ Mike: "Plan meal schedule" (assigned 5 days ago)
     ⏳ Sarah: "Price out new tent" (assigned 3 days ago)
  → Do you want to follow up with anyone?

🎵 Milonga Planning
  🟡 Spring Milonga — no next action defined!
  → Add a next action or mark as on hold?
```

### 7.3 Waiting For — Auto-Generated from Delegation

Same as existing spec, but team context is visible:

```
Waiting For
  Mike — "Plan meal schedule" (Camping Crew)     5 days ago
  Sarah — "Price out new tent" (Camping Crew)    3 days ago
  Guest Teacher — "Send bio and photo" (Workshop) 2 days ago
```

---

## 8. API Surface

### 8.1 New Endpoints

```
Teams:
  POST   /api/teams                    Create team
  GET    /api/teams                    List user's teams (with hierarchy)
  GET    /api/teams/:id                Team dashboard data
  PATCH  /api/teams/:id                Update team (name, description, icon)
  DELETE /api/teams/:id                Delete team (admin only)

Team Members:
  POST   /api/teams/:id/members        Invite member
  PATCH  /api/teams/:id/members/:uid   Update role/label
  DELETE /api/teams/:id/members/:uid   Remove member
  POST   /api/teams/:id/invite-link    Generate invite link
  
Team Hierarchy:
  POST   /api/teams/:id/children       Create child team
  PATCH  /api/teams/:id/move           Re-parent a team (admin of both)
  GET    /api/teams/:id/tree           Full subtree (for org chart view)
```

### 8.2 Modified Endpoints

```
Projects:
  POST /api/projects  — now accepts optional `teamId`
  GET  /api/projects  — now includes team projects in results
```

---

## 9. Roadmap Placement

This feature set splits across two releases:

**v1.1 — Flat Teams + Shared Projects** (ship with existing collaboration features)
- Team CRUD (no hierarchy yet — `parentTeamId` always null)
- TeamMember with roles and labels
- Team projects (auto-shared)
- Team dashboard
- Invitation flow (same-server + email + link)
- Weekly Review team awareness

**v1.2 — Team Hierarchy**
- `parentTeamId` self-reference enabled
- Membership inheritance (parent sees child team projects)
- Admin inheritance for structure management
- Org chart / tree view
- Re-parenting (move a team under a different parent)
- Depth limit enforcement

This phasing lets flat teams ship quickly (friend groups, twins) while the hierarchy layer gets proper testing before it handles company structures.

---

## 10. Migration Path

For servers upgrading from v1.0 (no teams) to v1.1:

- Existing shared projects (via `ProjectMember`) continue to work unchanged
- No data migration required — teams are additive
- Users can optionally "upgrade" a shared project to a team project by creating a team and re-assigning `project.teamId`
- A migration helper could offer: "You have 3 shared projects with the same 2 people. Create a team?"

---

## 11. Scope Filtering — Unified View with Team Awareness

### 11.1 Design Decision: Unified by Default

**Chosen approach: Option C — Unified doing surface + team dashboards for planning.**

The GTD principle that drives the entire app — *"I'm at home, I have 30 minutes, what can I get done?"* — must hold true across personal AND team tasks. Splitting into separate "modes" or "workspaces" would force users to check multiple views, breaking the cross-project context philosophy that makes Tandem different.

The rule: **"What Should I Do Now?" shows everything. Team dashboards show team overviews.**

- **Doing** = unified task list, all scopes, filterable
- **Planning** = team dashboards in sidebar, team-scoped

### 11.2 Scope as a Filter Dimension

Scope joins context, energy, and time as a fourth filter dimension on the primary work surface:

```
┌──────────────────────────────────────────────────────────┐
│  What Should I Do Now?                                    │
│                                                          │
│  ┌─ Scope ──────────────────────────────────────────┐    │
│  │ [All] [👤 Personal] [🏕️ Camping] [🎵 Tango]     │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Context ────────────────────────────────────────┐    │
│  │ [@home] [@errands] [@computer] [@phone]          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Time Available ─────────┐  ┌─ Energy ───────────┐   │
│  │ [15m] [30m] [1hr] [2hr+] │  │ [Low] [Med] [High] │   │
│  └──────────────────────────┘  └─────────────────────┘   │
│                                                          │
│  ═══════════════════════════════════════════════════════  │
│                                                          │
│  ☐ Call venue about Saturday       10m  Low              │
│    └ 🎵 Spring Milonga · @phone                          │
│  ☐ Call dentist for cleaning       10m  Low              │
│    └ 👤 Health · @phone                                  │
│  ☐ Update camping checklist        20m  Med              │
│    └ 🏕️ August Trip · @computer                          │
│  ☐ Sew side seams                  30m  Med              │
│    └ 👤 T-Shirt Project · @home                          │
└──────────────────────────────────────────────────────────┘
```

**Behaviors:**

- **Default is "All"** — every task the user can act on, regardless of source
- Scope pills are **toggle filters**, same UX as context pills (tap to filter, tap again to deselect)
- **Multiple scopes can be active** (OR logic) — e.g., select Camping + Tango to see both but hide personal
- **"Personal"** is a virtual scope meaning `project.teamId IS NULL`
- Each team scope is derived from `project.teamId` — no manual tagging needed
- Scope pills are **dynamically built** from the user's team memberships
- Each task card shows a **source badge** (small icon + color) alongside the existing project name and context badge
- Filter state persists across sessions (same as context/energy/time)

### 11.3 Source Badges on Task Cards

Each task shows its origin as scannable metadata. This is not a new UI paradigm — it extends the existing pattern of project name + context badge with one more piece:

```
┌──────────────────────────────────────────────────────┐
│ ☐ Call venue about Saturday setup        10m  🟡 Low │
│   └ 🎵 Spring Milonga · @phone                      │
└──────────────────────────────────────────────────────┘
     ↑                   ↑         ↑
     team icon/color    project   context badge
```

- **Personal tasks:** subtle `👤` icon or no badge (since personal is the default/expected)
- **Team tasks:** team icon + team color as a small pill before the project name
- **Nested teams:** show deepest team only (not the full chain) — "Milonga Planning" not "Tango Community → Milonga Planning"

### 11.4 Scope Is Derived, Never Tagged

A task's scope is **always derived** from its project's `teamId`. There is no `scope` field on tasks, no tag table, no manual assignment. This means:

- Moving a task to a different project automatically changes its scope
- Creating a task in a team project automatically gives it that team's scope
- The scope filter query is just a `WHERE` clause on the project relation

```typescript
// Scope filtering — no new models needed
function applyScopeFilter(
  tasks: TaskWithProject[],
  selectedScopes: string[] // ["personal", teamId1, teamId2, ...] or empty = all
): TaskWithProject[] {
  if (selectedScopes.length === 0) return tasks; // "All" — no filtering

  return tasks.filter((task) => {
    const taskTeamId = task.project?.teamId ?? "personal";
    return selectedScopes.includes(taskTeamId);
  });
}
```

### 11.5 Quick Views Gain Scope

The existing `QuickView` params object gains an optional `scope` field:

```typescript
interface QuickViewParams {
  context?: string;     // existing
  energy?: string;      // existing
  maxTime?: string;     // existing
  scope?: string;       // NEW: "personal" | teamId | undefined (all)
}
```

Example saved Quick Views with scope:

| Quick View | Scope | Context | Energy | Time |
|-----------|-------|---------|--------|------|
| Camping Errands | 🏕️ Camping Crew | @errands | Any | Any |
| Personal Deep Work | 👤 Personal | @computer | High | 60+ |
| All Phone Calls | All | @phone | Any | Any |
| Tango Admin | 🎵 Tango Community | @computer | Any | Any |
| Low Energy Everything | All | Any | Low | Any |

The Quick View manager UI adds a "Scope" dropdown alongside the existing Context, Energy, and Max Time fields.

### 11.6 Sidebar Mental Model

The sidebar makes the doing/planning distinction clear:

```
┌──────────────────────────────────┐
│  ☰ Tandem                       │
│                                  │
│  ─── Do ─────────────────────   │
│  📥 Inbox (3)                    │
│  ⚡ What Should I Do Now?        │  ← UNIFIED (all scopes)
│  ⚡ Quick Wins                   │  ← Quick View (all scopes)
│  ⚡ Low Energy                   │  ← Quick View (all scopes)
│  ⚡ Camping Errands              │  ← Quick View (scoped)
│                                  │
│  ─── Plan ───────────────────   │
│  📋 Projects                     │  ← all projects, scope filterable
│  🔄 Waiting For                  │
│  💤 Someday/Maybe                │
│  📝 Weekly Review                │
│                                  │
│  ─── Teams ──────────────────   │
│  👥 Camping Crew                 │  ← team DASHBOARD (planning)
│  👥 Courtemanche Twins           │  ← team DASHBOARD (planning)
│  👥 Tango Community              │  ← team DASHBOARD (planning)
│     ├─ Milonga Planning          │
│     └─ Workshop Series           │
│                                  │
│  ─── Horizons ───────────────   │
│  🏔️ Areas                       │
│  🎯 Goals                        │
│  🔭 Purpose & Vision             │
└──────────────────────────────────┘
```

Clicking "⚡ What Should I Do Now?" = unified task list for doing.
Clicking "👥 Camping Crew" = team dashboard for planning/managing.
Both show team tasks, but from different angles.

### 11.7 Projects View — Also Scope Filterable

The Projects list view gains the same scope filter:

```
┌──────────────────────────────────────────────────────────┐
│  Projects                                                │
│                                                          │
│  ┌─ Scope ──────────────────────────────────────────┐    │
│  │ [All] [👤 Personal] [🏕️ Camping] [🎵 Tango]     │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ▾ 👤 Health & Fitness                    (Personal)     │
│    ├─ 🔵 Swimming Practice               3 actions       │
│    └─ 🟢 Dentist Checkup                1 action        │
│                                                          │
│  ▾ 👤 Creative & Learning                (Personal)      │
│    ├─ 🔵 T-Shirt Construction            3 actions       │
│    └─ 🔵 CLO3D Learning Path            12 actions      │
│                                                          │
│  ▾ 🏕️ Camping Crew                                      │
│    ├─ 🔵 August Camping Trip            12 actions       │
│    └─ 🔵 Gear Inventory                 6 actions       │
│                                                          │
│  ▾ 🎵 Milonga Planning                                   │
│    └─ 🟡 Spring Milonga                  4 actions       │
└──────────────────────────────────────────────────────────┘
```

When scope is "All", projects group by source (personal areas first, then teams). When a specific scope is selected, only that scope's projects appear.

### 11.8 API Changes

The `/api/tasks/available` endpoint gains an optional `scope` query parameter:

```
GET /api/tasks/available                          → all tasks
GET /api/tasks/available?scope=personal           → personal only
GET /api/tasks/available?scope={teamId}           → single team
GET /api/tasks/available?scope=personal,{teamId}  → multiple scopes (OR)
```

The filtering happens server-side for the API, client-side for instant UI updates (same pattern as context/energy/time in the current implementation).

### 11.9 Notification Scope Preferences (Future: v1.2+)

As teams grow, users may want to control notification volume per scope. Future addition to User settings:

```
Notification Preferences:
  👤 Personal           [All notifications]
  🏕️ Camping Crew       [Assignments + completions]
  🎵 Tango Community    [Assignments only]
  🏢 Acme Corp          [Mentions only]
```

This is not needed for v1.1 (small groups don't generate notification noise) but becomes important for company-scale deployments.
