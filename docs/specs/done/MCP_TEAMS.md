# MCP Team Support — AI-Assisted Team Project Management

> **Status:** Draft
> **Last updated:** 2026-02-24

---

## 1. Problem Statement

### The Need

Tandem's MCP server exposes 17 tools and 4 resources — all scoped exclusively to the authenticated user via `where: { userId }`. The database already has Team, TeamMember, and `Project.teamId` fields, and a `team-permissions.ts` service with `isTeamMember()`, `isTeamAdmin()`, and `getUserTeamIds()` helpers. But MCP tools can't see team projects, can't create projects for a team, can't assign tasks to team members, and can't manage teams at all.

This means an AI assistant connected via MCP (Claude.ai, Claude Desktop, ChatGPT) is blind to any team context. If a user asks "what's the status of our team project?" or "assign this task to Sarah," the AI has no tools to do it.

### What "Done" Looks Like

1. **Existing tools are team-aware** — `tandem_task_list`, `tandem_project_list`, `tandem_what_now`, and `tandem_search` return team project data alongside personal data, with a `scope` filter to narrow results.
2. **New team management tools** — create/list teams, manage members, view team dashboard.
3. **Team project creation** — `tandem_project_create` accepts a `teamId` parameter to create projects owned by a team.
4. **Task assignment** — `tandem_task_create` and a new `tandem_task_assign` tool support `assignedToId` for delegating work to team members.
5. **Team resources** — `tandem://teams` resource gives AI a quick read of all teams the user belongs to.
6. **Permission enforcement** — every team operation validates membership via the existing `team-permissions.ts` service.

### Design Constraints

- Reuse existing `team-permissions.ts` service (`isTeamMember`, `isTeamAdmin`, `getUserTeamIds`)
- Follow the existing pattern in `project-service.ts` for team-scoped queries (OR clause with userId + teamIds)
- MCP auth is unchanged — one userId per session via `getUserId()` from AsyncLocalStorage
- No breaking changes to existing tools — personal data still works exactly the same
- Both HTTP and stdio transports must work (stdio uses `TANDEM_USER_ID` env var)

---

## 2. Scope Model

### How Team Scoping Works

A user can see:
- **Personal items** — `project.teamId IS NULL AND project.userId = userId`
- **Team items** — `project.teamId IN (user's team IDs)` regardless of who created them

This is already implemented in `project-service.ts` (lines 55-61). MCP tools need the same pattern.

### Scope Filter Parameter

Add an optional `scope` parameter to list/query tools:

| Value | Meaning |
|-------|---------|
| `"personal"` | Only personal items (no team) |
| `"team:{teamId}"` | Only items from a specific team |
| `"all"` | Personal + all teams (default) |

When `scope` is omitted, tools return everything the user can access (backward compatible).

### Query Pattern

```ts
const teamIds = await getUserTeamIds(userId);

function buildScopeFilter(scope?: string) {
  if (scope === "personal") {
    return { userId, project: { teamId: null } };
  }
  if (scope?.startsWith("team:")) {
    const teamId = scope.replace("team:", "");
    if (!teamIds.includes(teamId)) throw new Error("Not a member of this team");
    return { project: { teamId } };
  }
  // Default: all accessible
  return {
    OR: [
      { userId },
      ...(teamIds.length > 0
        ? [{ project: { teamId: { in: teamIds } } }]
        : []),
    ],
  };
}
```

---

## 3. Existing Tool Modifications

### 3.1 tandem_task_list

**Current:** `where: { userId, status }`

**Add parameters:**
- `scope` — optional, filter by personal/team/all
- `assignedToId` — optional, filter by who the task is assigned to

**Updated query:**
```ts
const scopeFilter = buildScopeFilter(scope);
where: {
  ...scopeFilter,
  status: { in: statusFilter },
  ...(contextId && { contextId }),
  ...(projectId && { projectId }),
  ...(energyLevel && { energyLevel }),
  ...(assignedToId && { assignedToId }),
}
```

**Response additions:** Include `assignedTo: { id, name }` and `project: { teamId, team: { name } }` in the returned task data so the AI knows which team a task belongs to.

### 3.2 tandem_task_create

**Add parameters:**
- `assignedToId` — optional, assign task to a team member

**Validation:** If `assignedToId` is provided:
1. The task must be in a project with a `teamId`
2. The `assignedToId` must be a member of that team
3. The authenticated user must be a member of that team

```ts
if (assignedToId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true },
  });
  if (!project?.teamId) throw new Error("Can only assign tasks in team projects");
  await requireTeamMember(userId, project.teamId);
  await requireTeamMember(assignedToId, project.teamId);
}
```

### 3.3 tandem_project_list

**Current:** `where: { userId, status }`

**Add parameters:**
- `scope` — optional, filter by personal/team/all
- `teamId` — optional, shorthand for `scope: "team:{teamId}"`

**Updated query:**
```ts
const scopeFilter = scope
  ? buildProjectScopeFilter(scope)
  : teamId
    ? { teamId }
    : {
        OR: [
          { userId },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      };
```

**Response additions:** Include `team: { id, name }` in returned projects.

### 3.4 tandem_project_create

**Add parameters:**
- `teamId` — optional, create project under a team

**Validation:** If `teamId` is provided:
1. User must be a member of the team
2. `userId` is still set (creator) but project is visible to all team members

```ts
if (teamId) {
  await requireTeamMember(userId, teamId);
}

const project = await prisma.project.create({
  data: {
    title,
    userId, // creator
    ...(teamId && { teamId }),
    // ... rest of fields
  },
});
```

### 3.5 tandem_what_now

**Current:** Only considers personal tasks.

**Updated:** Include tasks from team projects where user is assigned or unassigned:

```ts
const teamIds = await getUserTeamIds(userId);
where: {
  OR: [
    { userId, project: { teamId: null } },           // personal tasks
    { assignedToId: userId },                          // assigned to me in any team
    {
      assignedToId: null,                              // unassigned team tasks
      project: { teamId: { in: teamIds } },
    },
  ],
  status: "NOT_STARTED",
  isNextAction: true,
}
```

This way "What should I do now?" shows:
- All personal tasks (as before)
- Team tasks assigned to me
- Unassigned team tasks I could pick up

### 3.6 tandem_search

**Current:** Searches across tasks, projects, inbox scoped to userId.

**Updated:** Include team projects and their tasks in search results:

```ts
// Projects search
const projects = await prisma.project.findMany({
  where: {
    OR: [
      { userId },
      ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
    ],
    title: { contains: query, mode: "insensitive" },
  },
});

// Tasks search — include tasks in team projects
const tasks = await prisma.task.findMany({
  where: {
    OR: [
      { userId },
      { project: { teamId: { in: teamIds } } },
    ],
    title: { contains: query, mode: "insensitive" },
  },
});
```

### 3.7 tandem_waiting_for_list

**Current:** `where: { userId }`

**Updated:** Also show waiting-for items from team context. No change needed if waiting-for items are always personal. But if task assignment generates waiting-for entries (delegated tasks), those should appear here. This depends on whether the delegation spec (Teams spec §6) auto-creates WaitingFor records.

For now: keep as personal only. Revisit when delegation flow is implemented.

---

## 4. New Team Management Tools

### 4.1 tandem_team_list

List teams the user belongs to.

```ts
{
  name: "tandem_team_list",
  description: "List teams you belong to. Shows team name, your role, member count, and project count.",
  inputSchema: { type: "object", properties: {} },
}
```

**Handler:**
```ts
const memberships = await prisma.teamMember.findMany({
  where: { userId },
  include: {
    team: {
      include: {
        _count: { select: { members: true, projects: true } },
      },
    },
  },
});

return memberships.map(m => ({
  id: m.team.id,
  name: m.team.name,
  description: m.team.description,
  role: m.role, // ADMIN or MEMBER
  memberCount: m.team._count.members,
  projectCount: m.team._count.projects,
  joinedAt: m.joinedAt,
}));
```

### 4.2 tandem_team_create

Create a new team. Requires `teamsEnabled` server setting and appropriate permissions.

```ts
{
  name: "tandem_team_create",
  description: "Create a new team. You become the team admin.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Team name" },
      description: { type: "string", description: "Optional team description" },
    },
    required: ["name"],
  },
}
```

**Handler:**
```ts
// Check server setting
const settings = await prisma.serverSettings.findFirst();
if (!settings?.teamsEnabled) throw new Error("Teams are not enabled on this server");
if (settings.teamsAdminOnly) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) throw new Error("Only server admins can create teams");
}

const team = await prisma.team.create({
  data: {
    name,
    description,
    createdById: userId,
    members: {
      create: { userId, role: "ADMIN" },
    },
  },
});
```

### 4.3 tandem_team_members

List members of a team.

```ts
{
  name: "tandem_team_members",
  description: "List members of a team. Requires team membership.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string", description: "ID of the team" },
    },
    required: ["teamId"],
  },
}
```

**Handler:**
```ts
await requireTeamMember(userId, teamId);

const members = await prisma.teamMember.findMany({
  where: { teamId },
  include: { user: { select: { id: true, name: true, email: true } } },
});

return members.map(m => ({
  id: m.user.id,
  name: m.user.name,
  email: m.user.email,
  role: m.role,
  label: m.label,
  joinedAt: m.joinedAt,
}));
```

### 4.4 tandem_team_add_member

Add a member to a team. Requires team admin role.

```ts
{
  name: "tandem_team_add_member",
  description: "Add a user to a team. Requires team admin role.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string", description: "ID of the team" },
      userEmail: { type: "string", description: "Email of the user to add" },
      role: { type: "string", enum: ["ADMIN", "MEMBER"], description: "Role in the team (default: MEMBER)" },
    },
    required: ["teamId", "userEmail"],
  },
}
```

**Handler:**
```ts
await requireTeamAdmin(userId, teamId);

const targetUser = await prisma.user.findUnique({
  where: { email: userEmail },
  select: { id: true, name: true },
});
if (!targetUser) throw new Error(`No user found with email ${userEmail}`);

const existing = await prisma.teamMember.findUnique({
  where: { teamId_userId: { teamId, userId: targetUser.id } },
});
if (existing) throw new Error(`${targetUser.name} is already a member of this team`);

await prisma.teamMember.create({
  data: { teamId, userId: targetUser.id, role: role || "MEMBER" },
});
```

### 4.5 tandem_team_remove_member

Remove a member from a team. Requires team admin role.

```ts
{
  name: "tandem_team_remove_member",
  description: "Remove a user from a team. Requires team admin role. Cannot remove the last admin.",
  inputSchema: {
    type: "object",
    properties: {
      teamId: { type: "string", description: "ID of the team" },
      userId: { type: "string", description: "ID of the user to remove" },
    },
    required: ["teamId", "userId"],
  },
}
```

**Handler:**
```ts
await requireTeamAdmin(userId, teamId);

// Prevent removing the last admin
if (targetUserId !== userId) {
  const adminCount = await prisma.teamMember.count({
    where: { teamId, role: "ADMIN" },
  });
  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  if (targetMember?.role === "ADMIN" && adminCount <= 1) {
    throw new Error("Cannot remove the last team admin");
  }
}

await prisma.teamMember.delete({
  where: { teamId_userId: { teamId, userId: targetUserId } },
});
```

### 4.6 tandem_task_assign

Assign or reassign a task to a team member.

```ts
{
  name: "tandem_task_assign",
  description: "Assign a task to a team member, or unassign it. Task must be in a team project.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID of the task" },
      assignToEmail: { type: "string", description: "Email of the team member to assign to. Omit to unassign." },
    },
    required: ["taskId"],
  },
}
```

**Handler:**
```ts
const task = await prisma.task.findUnique({
  where: { id: taskId },
  include: { project: { select: { teamId: true } } },
});
if (!task) throw new Error("Task not found");
if (!task.project?.teamId) throw new Error("Can only assign tasks in team projects");

await requireTeamMember(userId, task.project.teamId);

let assignedToId: string | null = null;
if (assignToEmail) {
  const target = await prisma.user.findUnique({ where: { email: assignToEmail } });
  if (!target) throw new Error(`No user found with email ${assignToEmail}`);
  await requireTeamMember(target.id, task.project.teamId);
  assignedToId = target.id;
}

await prisma.task.update({
  where: { id: taskId },
  data: { assignedToId },
});
```

---

## 5. New Team Resource

### tandem://teams

Read-only summary of all teams the user belongs to, with project counts and member names.

**File:** `src/mcp/resources.ts`

```ts
{
  uri: "tandem://teams",
  name: "Teams Overview",
  description: "All teams you belong to with members, projects, and your role in each.",
  mimeType: "application/json",
}
```

**Handler:**
```ts
const memberships = await prisma.teamMember.findMany({
  where: { userId },
  include: {
    team: {
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        projects: {
          where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
          select: { id: true, title: true, status: true },
        },
        _count: { select: { members: true, projects: true } },
      },
    },
  },
});
```

---

## 6. Response Format Additions

All tools that return tasks or projects should include team context when relevant:

### Task Response

```ts
{
  id: "...",
  title: "Design landing page",
  // ... existing fields ...
  assignedTo: { id: "...", name: "Sarah" } | null,
  project: {
    id: "...",
    title: "Website Redesign",
    team: { id: "...", name: "Design Team" } | null,
  },
}
```

### Project Response

```ts
{
  id: "...",
  title: "Website Redesign",
  // ... existing fields ...
  team: { id: "...", name: "Design Team" } | null,
  memberCount: 4,
}
```

This lets the AI naturally say "This task is in the Design Team's Website Redesign project, assigned to Sarah."

---

## 7. Permission Summary

| Operation | Requires |
|-----------|----------|
| View team projects/tasks | Team member |
| Create project in team | Team member |
| Create task in team project | Team member |
| Assign task to team member | Team member |
| Add member to team | Team admin |
| Remove member from team | Team admin |
| Create team | Server setting (`teamsEnabled`, optionally `teamsAdminOnly`) |
| Delete team | Team admin (not covered in this spec — separate concern) |

All permission checks use the existing `team-permissions.ts` service.

---

## 8. Implementation Plan

### Phase 1 — Team-Aware Existing Tools

1. Create `buildScopeFilter()` utility in `src/mcp/tools.ts`
2. Update `tandem_task_list` — add `scope` param, include team tasks
3. Update `tandem_project_list` — add `scope` and `teamId` params
4. Update `tandem_project_create` — add `teamId` param
5. Update `tandem_what_now` — include assigned + unassigned team tasks
6. Update `tandem_search` — include team projects and tasks
7. Update response formats to include team/assignee info

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/mcp/tools.ts` |

### Phase 2 — New Team Management Tools

1. Add `tandem_team_list` tool
2. Add `tandem_team_create` tool
3. Add `tandem_team_members` tool
4. Add `tandem_team_add_member` tool
5. Add `tandem_team_remove_member` tool
6. Add `tandem://teams` resource

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/mcp/tools.ts` |
| MODIFY | `src/mcp/resources.ts` |

### Phase 3 — Task Assignment

1. Add `tandem_task_assign` tool
2. Add `assignedToId` parameter to `tandem_task_create`
3. Add `assignedToId` filter to `tandem_task_list`

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/mcp/tools.ts` |

### Testing

- Create a team via MCP → verify it appears in `tandem_team_list`
- Add a member → verify they appear in `tandem_team_members`
- Create a team project → verify it appears in `tandem_project_list` for both members
- Create a task in team project → verify both members see it in `tandem_task_list`
- Assign task to member → verify `tandem_what_now` shows it for assignee
- Non-member tries to access team project → verify permission denied
- Member tries admin operation → verify permission denied
- `scope: "personal"` → verify no team items returned
- `scope: "team:{id}"` → verify only that team's items returned
- Test via both HTTP transport (Claude.ai) and stdio transport (Claude Desktop)

---

## 9. Edge Cases

### User Removed from Team
Tasks assigned to them in that team remain assigned (orphaned assignment). The task is no longer visible to them via MCP. Team admin should reassign or unassign. Could add auto-unassign on member removal as a future enhancement.

### Team Project with Sub-Projects
Sub-projects inherit the parent's `teamId`. The `tandem_project_create` with `parentProjectId` already handles hierarchy. If the parent is a team project, the child should automatically get the same `teamId`.

### Stdio Mode (Claude Desktop)
`TANDEM_USER_ID` env var sets the user. `getUserTeamIds()` works the same way — it queries TeamMember for that userId. No transport-specific changes needed.

### No Teams Exist
All tools behave identically to today — `getUserTeamIds()` returns an empty array, the OR clause has no team conditions, only personal items are returned.

### Server Has Teams Disabled
`tandem_team_create` checks `serverSettings.teamsEnabled` and rejects. Other tools still work — if teams exist in the DB (from before the toggle), they remain visible.

---

## 10. Missing Core Task & Inbox CRUD Tools

### The Gap

The MCP server has `tandem_task_create`, `tandem_task_complete`, `tandem_task_list`, and `tandem_task_assign` — but no way to **update** or **delete** an existing task. Similarly, inbox items can be added and listed but not updated or deleted. This is a significant limitation: if an AI creates a task with a typo, wrong notes, or incorrect metadata, the only recourse is to tell the user to fix it in the web UI.

By contrast, goals already have `tandem_goal_update`. Tasks should have parity.

### 10.1 tandem_task_update

Update an existing task's fields. Mirrors `PATCH /api/tasks/[id]`.

```ts
{
  name: "tandem_task_update",
  description: "Update an existing task. Can change title, notes, status, energy level, time estimate, due date, scheduled date, context, or project.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID of the task to update" },
      title: { type: "string", description: "New title" },
      notes: { type: "string", description: "New notes (markdown)" },
      status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DROPPED"], description: "New status" },
      energyLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "Energy level required" },
      estimatedMins: { type: "number", description: "Estimated time in minutes" },
      dueDate: { type: "string", description: "Due date (ISO 8601). Set to empty string to clear." },
      scheduledDate: { type: "string", description: "Scheduled/tickler date (ISO 8601). Set to empty string to clear." },
      contextId: { type: "string", description: "Context ID. Set to empty string to clear." },
      projectId: { type: "string", description: "Project ID to move task to. Set to empty string to remove from project." },
      isNextAction: { type: "boolean", description: "Whether this is a next action" },
    },
    required: ["taskId"],
  },
}
```

**Handler logic:**
- Find the task by ID, verify ownership (personal task: `userId` match; team task: team membership)
- Build update object from provided fields only (skip undefined)
- For team project tasks, validate that `contextId`/`projectId` changes respect team scope
- Create a `TaskEvent` with `eventType: UPDATED` for audit trail
- Return the updated task

### 10.2 tandem_task_delete

Delete a task by ID.

```ts
{
  name: "tandem_task_delete",
  description: "Delete a task by ID. Cannot be undone.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID of the task to delete" },
    },
    required: ["taskId"],
  },
}
```

**Handler logic:**
- Find the task, verify ownership
- For team tasks, require the task to be owned by the user OR the user to be team admin
- Delete the task (cascades handle events, snapshots, dependencies)
- Return confirmation with the deleted task's title

### 10.3 tandem_inbox_update

Update an inbox item's content or notes.

```ts
{
  name: "tandem_inbox_update",
  description: "Update an inbox item's content or notes.",
  inputSchema: {
    type: "object",
    properties: {
      itemId: { type: "string", description: "ID of the inbox item" },
      content: { type: "string", description: "New content/title" },
      notes: { type: "string", description: "New notes" },
    },
    required: ["itemId"],
  },
}
```

### 10.4 tandem_inbox_delete

Delete an inbox item.

```ts
{
  name: "tandem_inbox_delete",
  description: "Delete an inbox item by ID.",
  inputSchema: {
    type: "object",
    properties: {
      itemId: { type: "string", description: "ID of the inbox item to delete" },
    },
    required: ["itemId"],
  },
}
```

### Implementation Priority

`tandem_task_update` is the highest priority — it's the most commonly needed missing tool. AI assistants frequently need to fix task metadata after creation (correcting titles, adding notes, setting due dates, changing energy levels). The other three tools should be implemented alongside it.

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/mcp/tools.ts` — add tool definitions + handlers |

---

## 11. What This Spec Does Not Cover

- **Team deletion** — deleting a team and handling its projects/tasks. Separate concern with significant cascade implications.
- **Team hierarchy** — `parentTeamId` for nested teams. The schema supports it but it's not needed for MCP v1.
- **Project roles** (OWNER/COLLABORATOR/VIEWER) — finer-grained access control within a team. Currently all team members have equal access to team projects.
- **Real-time notifications** — notifying team members when tasks are assigned/completed via MCP. Depends on the Notifications spec.
- **Team chat/comments** — discussion threads on team tasks. Separate feature.
- **Audit logging** — recording who did what via MCP in team context. The existing `TeamEvent` model could be extended.
- **Project update/delete via MCP** — `tandem_project_update` and `tandem_project_delete` are also missing but lower priority than task CRUD.
