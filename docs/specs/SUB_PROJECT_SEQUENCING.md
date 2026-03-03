# Sub-Project Sequencing — Cascade-Driven Activation for Child Projects

> **Status:** Draft
> **Last updated:** 2026-02-25

---

## 1. Problem Statement

### The Gap

`Project.type` (SEQUENTIAL, PARALLEL, SINGLE_ACTIONS) controls task ordering within a project — the cascade engine promotes the next task by `sortOrder` when one completes. But this logic has **no effect on child projects**. Sub-projects are all created as ACTIVE regardless of the parent's type, and completing one does not activate the next.

Furthermore, task ordering and sub-project ordering are conceptually independent. A parent project might want its own tasks in parallel (all available at once) while its sub-projects run sequentially (Shopping → Prep → Cook → Serve). The current single `type` field can't express this — it would force both tasks and sub-projects into the same mode.

This means a parent with multiple sub-projects (like "Sunday Meal Prep" with Shopping → Setup → Phase 1 → Phase 2 → Phase 3 → Phase 4) requires the user to manually manage ON_HOLD/ACTIVE status on every sub-project — defeating the purpose of the cascade engine.

### What Exists

- **Sub-project hierarchy:** `parentProjectId`, `depth` (max 2), `path` (materialized), self-referential `"ProjectChildren"` relation
- **Rollup aggregation:** `rollupProgress` and `rollupStatus` computed by `recalculateProjectRollups()`
- **Upward cascade on completion:** `checkProjectCompletion()` checks both `remainingTasks` and `activeChildProjects`, then recursively checks the parent
- **`sortOrder` on Project:** `Int`, default 0 — currently used for display ordering only
- **Type change handling:** `updateProject()` already recalculates `isNextAction` for all tasks when `type` changes
- **Tree and outline APIs:** already order children by `sortOrder: "asc"`

### What's Missing

- No separate control for sub-project ordering vs. task ordering
- No concept of a "next active child project" within a sequentially-ordered parent
- No logic analogous to `isNextAction` for child projects
- `checkProjectCompletion()` does not promote the next sibling when a child completes
- `POST /api/projects/[id]/children` creates all children as ACTIVE
- No reorder endpoint for sibling sub-projects
- `rollupStatus` flags ON_HOLD children as stalled even when they're correctly queued

### What Done Looks Like

1. A new `childType` field on Project (SEQUENTIAL or PARALLEL) independently controls sub-project ordering, separate from the existing `type` field that controls tasks.
2. Creating a sub-project under a parent with `childType: SEQUENTIAL` auto-sets its status to ON_HOLD (unless it's the first child).
3. When a child project completes, the cascade engine activates the next ON_HOLD sibling by `sortOrder`.
4. Dropping a child project also promotes the next sibling.
5. A reorder endpoint allows bulk-reordering sibling sub-projects.
6. Changing `childType` between SEQUENTIAL and PARALLEL adjusts child statuses accordingly.
7. `rollupStatus` correctly treats ON_HOLD children as expected when `childType` is SEQUENTIAL.

---

## 2. Data Model Changes

### New Field: `childType`

Add a `childType` field to the Project model. This controls how sub-projects are ordered, independently of `type` (which controls tasks).

```prisma
model Project {
  // ... existing fields ...
  type          ProjectType   @default(SEQUENTIAL)    // Controls TASK ordering
  childType     ChildType     @default(SEQUENTIAL)    // Controls SUB-PROJECT ordering
  // ...
}

enum ChildType {
  SEQUENTIAL    // Sub-projects activate one at a time, in sortOrder
  PARALLEL      // All sub-projects are active simultaneously
}
```

**Why a separate enum instead of reusing `ProjectType`?** `ProjectType` includes `SINGLE_ACTIONS` which is meaningful for tasks (a container for unrelated one-off tasks) but not for sub-projects. Sub-projects are always structured — they're either ordered or not. A two-value enum keeps the concept clean.

**Default:** `SEQUENTIAL` — matches the most common use case (phased work) and the existing `type` default. Projects without children are unaffected since `childType` is only checked when operating on children.

### Existing Fields Used

| Field | Model | Role in Sequencing |
|-------|-------|--------------------|
| `sortOrder` | Project | Determines activation order among siblings |
| `status` | Project | ON_HOLD = queued, ACTIVE = current, COMPLETED = done |
| `childType` | Project | **New** — parent's child ordering mode (SEQUENTIAL or PARALLEL) |
| `type` | Project | Unchanged — controls task ordering only |
| `parentProjectId` | Project | Identifies sibling group |

### New ProjectEventType Values

Add two values to the `ProjectEventType` enum:

```prisma
enum ProjectEventType {
  // ... existing values ...
  CHILD_ACTIVATED       // A queued child was promoted to ACTIVE
  CHILDREN_REORDERED    // Sibling sub-projects were reordered
}
```

### New Validation Schema

```typescript
// src/lib/validations/project.ts

export const reorderChildrenSchema = z.object({
  childIds: z.array(z.string()).min(1),
});

export type ReorderChildrenInput = z.infer<typeof reorderChildrenSchema>;
```

Add `childType` to existing schemas:

```typescript
// In createProjectSchema:
childType: z.enum(["SEQUENTIAL", "PARALLEL"]).default("SEQUENTIAL"),

// In updateProjectSchema:
childType: z.enum(["SEQUENTIAL", "PARALLEL"]).optional(),
```

---

## 3. Core Logic

New module: `src/lib/sub-project-sequencing.ts`

### 3.1 `computeChildInitialStatus(parentId, parentChildType)`

Determines what status a new child project should receive based on the parent's `childType`.

```typescript
export async function computeChildInitialStatus(
  parentId: string,
  parentChildType: ChildType
): Promise<ProjectStatus> {
  // PARALLEL: all children are immediately active
  if (parentChildType !== ChildType.SEQUENTIAL) {
    return ProjectStatus.ACTIVE;
  }

  // SEQUENTIAL: check if any active/on-hold children exist
  const existingChildren = await prisma.project.count({
    where: {
      parentProjectId: parentId,
      status: { in: [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD] },
    },
  });

  // First child is ACTIVE; subsequent children are ON_HOLD
  return existingChildren === 0 ? ProjectStatus.ACTIVE : ProjectStatus.ON_HOLD;
}
```

### 3.2 `computeChildSortOrder(parentId)`

Assigns the next sequential sort position.

```typescript
export async function computeChildSortOrder(parentId: string): Promise<number> {
  const maxChild = await prisma.project.findFirst({
    where: { parentProjectId: parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return (maxChild?.sortOrder ?? -1) + 1;
}
```

### 3.3 `promoteNextChild(completedChildId, parentId, userId, actor, tx?)`

Called when a child project completes or is dropped. Finds the next ON_HOLD sibling by `sortOrder` and activates it.

```typescript
export async function promoteNextChild(
  completedChildId: string,
  parentId: string,
  userId: string,
  actor: ActorContext,
  tx?: PrismaTransactionClient
): Promise<{ id: string; title: string } | null> {
  const db = tx ?? prisma;

  // Check that parent uses SEQUENTIAL child ordering
  const parent = await db.project.findUnique({
    where: { id: parentId },
    select: { childType: true },
  });

  if (parent?.childType !== ChildType.SEQUENTIAL) return null;

  // Find next ON_HOLD sibling by sortOrder
  const nextChild = await db.project.findFirst({
    where: {
      parentProjectId: parentId,
      status: ProjectStatus.ON_HOLD,
      id: { not: completedChildId },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (!nextChild) return null;

  // Activate it
  await db.project.update({
    where: { id: nextChild.id },
    data: { status: ProjectStatus.ACTIVE },
  });

  // Write history events
  await writeProjectEvent(nextChild.id, userId, ProjectEventType.REACTIVATED, actor, db);
  await writeProjectEvent(parentId, userId, ProjectEventType.CHILD_ACTIVATED, actor, db, {
    childId: nextChild.id,
    childTitle: nextChild.title,
  });

  return { id: nextChild.id, title: nextChild.title };
}
```

### 3.4 `reconcileChildrenOnChildTypeChange(parentId, oldChildType, newChildType, userId, actor)`

Adjusts child statuses when the parent's `childType` changes.

```typescript
export async function reconcileChildrenOnChildTypeChange(
  parentId: string,
  oldChildType: ChildType,
  newChildType: ChildType,
  userId: string,
  actor: ActorContext
): Promise<void> {
  if (oldChildType === newChildType) return;

  if (newChildType === ChildType.SEQUENTIAL) {
    // PARALLEL → SEQUENTIAL:
    // Keep only the first active child (by sortOrder), put the rest ON_HOLD
    const activeChildren = await prisma.project.findMany({
      where: {
        parentProjectId: parentId,
        status: ProjectStatus.ACTIVE,
      },
      orderBy: { sortOrder: "asc" },
    });

    // Skip the first one (it stays ACTIVE), put the rest ON_HOLD
    for (const child of activeChildren.slice(1)) {
      await prisma.project.update({
        where: { id: child.id },
        data: { status: ProjectStatus.ON_HOLD },
      });
    }
  } else {
    // SEQUENTIAL → PARALLEL:
    // Activate all ON_HOLD children
    await prisma.project.updateMany({
      where: {
        parentProjectId: parentId,
        status: ProjectStatus.ON_HOLD,
      },
      data: { status: ProjectStatus.ACTIVE },
    });
  }
}
```

### 3.5 `reorderChildren(parentId, childIds, userId, actor)`

Bulk-reorder sibling sub-projects. Validates that all provided IDs are actual children of the parent.

```typescript
export async function reorderChildren(
  parentId: string,
  childIds: string[],
  userId: string,
  actor: ActorContext
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Validate all IDs are children of this parent
    const children = await tx.project.findMany({
      where: { parentProjectId: parentId },
      select: { id: true },
    });

    const childIdSet = new Set(children.map((c) => c.id));
    for (const id of childIds) {
      if (!childIdSet.has(id)) {
        throw new Error(`Project ${id} is not a child of ${parentId}`);
      }
    }

    // Update sortOrder for each child
    for (let i = 0; i < childIds.length; i++) {
      await tx.project.update({
        where: { id: childIds[i] },
        data: { sortOrder: i },
      });
    }

    // Write history event
    await writeProjectEvent(parentId, userId, ProjectEventType.CHILDREN_REORDERED, actor, tx);

    // Reconcile sequential ordering if parent uses sequential child ordering
    await reconcileSequentialChildren(parentId, userId, actor, tx);
  });
}
```

### 3.6 `reconcileSequentialChildren(parentId, userId, actor, tx?)`

Ensures exactly one child is ACTIVE in a sequentially-ordered parent — the first non-completed child by `sortOrder`.

```typescript
export async function reconcileSequentialChildren(
  parentId: string,
  userId: string,
  actor: ActorContext,
  tx?: PrismaTransactionClient
): Promise<void> {
  const db = tx ?? prisma;

  const parent = await db.project.findUnique({
    where: { id: parentId },
    select: { childType: true },
  });

  if (parent?.childType !== ChildType.SEQUENTIAL) return;

  const children = await db.project.findMany({
    where: {
      parentProjectId: parentId,
      status: { in: [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD] },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (children.length === 0) return;

  // First child should be ACTIVE, rest ON_HOLD
  for (let i = 0; i < children.length; i++) {
    const targetStatus = i === 0 ? ProjectStatus.ACTIVE : ProjectStatus.ON_HOLD;
    if (children[i].status !== targetStatus) {
      await db.project.update({
        where: { id: children[i].id },
        data: { status: targetStatus },
      });
    }
  }
}
```

---

## 4. Cascade Engine Integration

### 4.1 Extend `checkProjectCompletion()`

In `src/lib/cascade.ts`, after a child project is marked COMPLETED, promote the next sibling:

```typescript
// Inside checkProjectCompletion(), after marking project COMPLETED:
if (project.parentProjectId) {
  // Existing: recalculate rollups
  await recalculateProjectRollups(project.parentProjectId);

  // NEW: promote next child in sequential parent
  const activated = await promoteNextChild(
    projectId, project.parentProjectId, userId, actor
  );
  if (activated) {
    result.activatedProjects.push(activated);
  }

  // Existing: recursive parent completion check
  await checkProjectCompletion(project.parentProjectId, userId, result);
}
```

### 4.2 Extend `CascadeResult`

```typescript
export interface CascadeResult {
  promotedTasks: Array<{ id: string; title: string }>;
  completedProjects: Array<{ id: string; title: string }>;
  updatedGoals: Array<{ id: string; title: string; progress: number }>;
  completedMilestones: Array<{ id: string; title: string }>;
  updatedRollups: Array<{ id: string; title: string; progress: number }>;
  activatedProjects: Array<{ id: string; title: string }>;  // NEW
}
```

### 4.3 Fix `rollupStatus` for Sequential Parents

In `recalculateProjectRollups()`, ON_HOLD children in a `childType: SEQUENTIAL` parent are expected — they should not mark the parent's rollupStatus as ON_HOLD:

```typescript
// When computing rollupStatus, skip ON_HOLD children if parent uses sequential child ordering
const statusChildren = parent.childType === ChildType.SEQUENTIAL
  ? childProjects.filter((c) => c.status !== ProjectStatus.ON_HOLD)
  : childProjects;
```

---

## 5. API Changes

### 5.1 `POST /api/projects/[id]/children` — Auto-Set Status and SortOrder

Update the children creation endpoint to use the new sequencing functions, checking the parent's `childType`:

```typescript
// Compute initial status and sortOrder based on parent's childType
const initialStatus = await computeChildInitialStatus(parent.id, parent.childType);
const sortOrder = await computeChildSortOrder(parent.id);

const child = await prisma.project.create({
  data: {
    ...validated,
    userId: session.user.id,
    parentProjectId: parent.id,
    depth: parent.depth + 1,
    path: parent.path + parent.id + "/",
    areaId: parent.areaId,
    goalId: parent.goalId,
    status: initialStatus,
    sortOrder,
  },
});
```

### 5.2 `PATCH /api/projects/[id]/children/reorder` — New Endpoint

```typescript
// src/app/api/projects/[id]/children/reorder/route.ts

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const body = await req.json();
  const validated = reorderChildrenSchema.parse(body);

  // Verify project exists and user owns it
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!project) return notFound();

  await reorderChildren(params.id, validated.childIds, session.user.id, {
    source: "MANUAL",
    userId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
```

### 5.3 `PATCH /api/projects/[id]` — childType Change Cascade

In the existing update endpoint, add reconciliation when `childType` changes:

```typescript
// Handle childType change — reconcile child statuses
if (updates.childType && updates.childType !== existing.childType) {
  await reconcileChildrenOnChildTypeChange(
    projectId, existing.childType, updates.childType, userId, actor
  );
}
```

Also handle manual status changes that should trigger promotion:

```typescript
// If status changed to COMPLETED or DROPPED and project has a parent
if (
  (updates.status === "COMPLETED" || updates.status === "DROPPED") &&
  existing.parentProjectId
) {
  await promoteNextChild(projectId, existing.parentProjectId, userId, actor);
}
```

Note: The existing `type` change logic for tasks is **unchanged** — `type` still only recalculates `isNextAction` for tasks. The two fields are fully independent.

### 5.4 `GET /api/projects/[id]` — Ensure Sort Order and Include childType

The child projects query should order by `sortOrder` and the response should include `childType`:

```typescript
childProjects: {
  orderBy: { sortOrder: "asc" },
  // ... existing select
}
```

(The tree and outline endpoints already order by `sortOrder: "asc"`.)

---

## 6. MCP Integration

Update `tandem_project_create` in `src/mcp/tools.ts`:

When `parentProjectId` is provided, use `computeChildInitialStatus()` and `computeChildSortOrder()` to auto-set the child's status and sort position, checking the parent's `childType`:

```typescript
// Inside tandem_project_create handler, when parentProjectId is set:
if (parentProjectId) {
  const parent = await prisma.project.findUnique({
    where: { id: parentProjectId },
    select: { childType: true },
  });

  if (parent) {
    initialStatus = await computeChildInitialStatus(parentProjectId, parent.childType);
    sortOrder = await computeChildSortOrder(parentProjectId);
  }
}
```

Update the `tandem_project_create` tool description to mention:

> Sub-projects of parents with `childType: SEQUENTIAL` start ON_HOLD (queued) except the first, which starts ACTIVE. The cascade engine auto-activates the next sub-project when one completes. `childType` controls sub-project ordering independently of `type` (which controls task ordering).

Add `childType` as an optional parameter to `tandem_project_create`:

```typescript
childType: {
  type: "string",
  enum: ["SEQUENTIAL", "PARALLEL"],
  description: "How sub-projects are ordered. SEQUENTIAL: one at a time. PARALLEL: all active. Default: SEQUENTIAL. Independent of 'type' which controls task ordering.",
}
```

---

## 7. UI Changes

### 7.1 Separate Dropdowns for Task Type and Child Type

In the project edit form, display two separate controls:

- **Task ordering** (`type`): Sequential / Parallel / Single Actions — existing dropdown, controls task `isNextAction` logic
- **Sub-project ordering** (`childType`): Sequential / Parallel — new dropdown, controls child project activation

The `childType` dropdown should only appear when the project has (or could have) sub-projects. Label it clearly:

- "Task ordering: Sequential" — tasks advance one at a time
- "Sub-project ordering: Sequential" — sub-projects activate one at a time

### 7.2 Sequence Position Indicator

In `ProjectTreeView.tsx` and `MasterOutlineView.tsx`, show a position badge for children of sequentially-ordered parents (`childType: SEQUENTIAL`):

- ACTIVE child: numbered badge (e.g., "1 of 6") with active styling
- ON_HOLD children: numbered badge with muted styling
- COMPLETED children: checkmark or strikethrough

### 7.3 childType Change Confirmation

When the user changes `childType`, show a confirmation dialog explaining the status changes that will occur:

- "Switching to Sequential will set all sub-projects except the first to On Hold. Continue?"
- "Switching to Parallel will activate all queued sub-projects. Continue?"

### 7.4 Drag-and-Drop Reorder (Future)

A future phase can add drag-and-drop reordering of sibling sub-projects in the tree view, calling the reorder endpoint on drop.

---

## 8. Edge Cases

### 8.1 PARALLEL → SEQUENTIAL (childType change)

The first ACTIVE child (by `sortOrder`) stays ACTIVE. All other ACTIVE children become ON_HOLD. COMPLETED and DROPPED children are untouched.

### 8.2 SEQUENTIAL → PARALLEL (childType change)

All ON_HOLD children become ACTIVE. Everything else is untouched.

### 8.3 Dropped / Skipped Child

When a child is DROPPED, the next ON_HOLD sibling is promoted — same as completion. However, if a dropped child is later reactivated, it does **not** displace the currently active child. The user must manually reorder if they want to re-sequence. GTD philosophy trusts the user — the system provides guardrails, not handcuffs.

### 8.4 Manual ACTIVE Override

If the user manually sets a queued child to ACTIVE, the system allows it. Multiple ACTIVE children can coexist — the sequential logic only auto-promotes on completion/drop events. This respects user intent and avoids fighting manual decisions.

### 8.5 Parent Has Both Tasks and Sub-Projects

Tasks and sub-projects are **fully independent sequences** controlled by separate fields. `type` governs task `isNextAction` promotion. `childType` governs sub-project activation. A project can have `type: PARALLEL` (all tasks available) with `childType: SEQUENTIAL` (sub-projects activate one at a time), or any other combination.

### 8.6 All Children Completed

When the last child completes, the parent has no remaining tasks or active children, so `checkProjectCompletion()` auto-completes the parent. This is existing behavior — it chains upward recursively.

### 8.7 Reorder Changes Active Child

If reordering moves a different child to position 0, `reconcileSequentialChildren()` recalculates: the new first non-completed child becomes ACTIVE, and the previous active child becomes ON_HOLD.

### 8.8 Creating a Sub-Project When Parent Is COMPLETED

Reactivate the parent (set status back to ACTIVE). This matches the existing behavior when adding a task to a completed project.

### 8.9 Someday/Maybe Children

Children with `SOMEDAY_MAYBE` status are excluded from sequential ordering. They don't participate in the queue and are not promoted or demoted by `childType` changes.

### 8.10 Team Projects

Sub-project sequencing works identically for team-owned projects. The `userId` check in the API endpoints already handles authorization. No special team logic needed.

### 8.11 Changing `type` Does Not Affect Children

Changing `type` (task ordering) only recalculates `isNextAction` on the project's own tasks — it has no effect on child project statuses. Only `childType` changes trigger child reconciliation.

---

## 9. Implementation Phases

### Phase 1: Schema + Core Sequencing Engine + Cascade Integration

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `ChildType` enum, add `childType` field to Project, add `CHILD_ACTIVATED` + `CHILDREN_REORDERED` to `ProjectEventType` |
| `src/lib/sub-project-sequencing.ts` | **New file** — all core functions |
| `src/lib/cascade.ts` | Extend `CascadeResult`, integrate `promoteNextChild` in `checkProjectCompletion`, fix `rollupStatus` to check `childType` |
| `src/lib/validations/project.ts` | Add `reorderChildrenSchema`, add `childType` to create/update schemas |

### Phase 2: API Endpoints + Project Service

| File | Changes |
|------|---------|
| `src/app/api/projects/[id]/children/route.ts` | Auto-set status and sortOrder using parent's `childType` |
| `src/app/api/projects/[id]/children/reorder/route.ts` | **New endpoint** |
| `src/lib/services/project-service.ts` | `childType` change reconciliation, manual status promotion |

### Phase 3: MCP Integration

| File | Changes |
|------|---------|
| `src/mcp/tools.ts` | Auto-set status/sortOrder in `tandem_project_create` using parent's `childType`, add `childType` param |

### Phase 4: UI Enhancements

| File | Changes |
|------|---------|
| Project edit form / dialog | Separate "Sub-project ordering" dropdown for `childType` |
| `src/components/projects/ProjectTreeView.tsx` | Sequence position indicator |
| `src/components/projects/MasterOutlineView.tsx` | Sequence position indicator |
| `childType` change dialog | Confirmation for child status impact |

### Phase 5: Drag-and-Drop Reorder (Future)

Drag-and-drop reordering of sibling sub-projects in tree/outline views, calling `PATCH /api/projects/[id]/children/reorder` on drop.

---

## 10. Testing Strategy

### Unit Tests — `src/lib/sub-project-sequencing.ts`

```
describe("computeChildInitialStatus")
  - returns ACTIVE for parent with childType PARALLEL
  - returns ACTIVE for first child of parent with childType SEQUENTIAL
  - returns ON_HOLD for subsequent children of parent with childType SEQUENTIAL

describe("promoteNextChild")
  - activates next ON_HOLD sibling by sortOrder
  - skips COMPLETED and DROPPED siblings
  - returns null if parent childType is PARALLEL
  - returns null if no ON_HOLD siblings remain
  - writes REACTIVATED and CHILD_ACTIVATED events

describe("reconcileChildrenOnChildTypeChange")
  - PARALLEL → SEQUENTIAL: first child stays ACTIVE, rest become ON_HOLD
  - SEQUENTIAL → PARALLEL: all ON_HOLD children become ACTIVE
  - no-op if childType doesn't change
  - ignores COMPLETED, DROPPED, SOMEDAY_MAYBE children

describe("reorderChildren")
  - updates sortOrder for all provided IDs
  - throws if any ID is not a child of the parent
  - reconciles sequential ordering after reorder

describe("reconcileSequentialChildren")
  - first non-completed child becomes ACTIVE
  - remaining non-completed children become ON_HOLD
  - no-op for parents with childType PARALLEL
```

### Integration Test — Full Cascade Chain

```
describe("sub-project sequential cascade")
  - completing last task in child → child completes → next sibling activates → rollups update
  - completing last child → parent auto-completes → grandparent rollups update
  - dropping a child → next sibling activates
  - parent with type PARALLEL + childType SEQUENTIAL: tasks are all available, sub-projects activate one at a time
```

---

## 11. Key Files Reference

| File | Current Role | Changes |
|------|-------------|---------|
| `prisma/schema.prisma` | Data model | Add `ChildType` enum, `childType` field, 2 event type values |
| `src/lib/cascade.ts` | Task cascade engine | Sub-project promotion, rollup fix (check `childType`) |
| `src/lib/sub-project-sequencing.ts` | — | **New** — core sequencing logic |
| `src/lib/services/project-service.ts` | Project CRUD service | `childType` change + status change hooks |
| `src/lib/validations/project.ts` | Zod schemas | Add `reorderChildrenSchema`, `childType` to create/update |
| `src/app/api/projects/[id]/children/route.ts` | Create sub-project | Auto-set status + sortOrder via parent's `childType` |
| `src/app/api/projects/[id]/children/reorder/route.ts` | — | **New** — reorder endpoint |
| `src/mcp/tools.ts` | MCP tool handlers | Auto-set status/sortOrder, add `childType` param |
| `src/lib/history/event-writer.ts` | History events | Used by new functions (no changes) |
