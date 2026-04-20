# PM Foundation — Sub-Projects and Schema Migration

**Version:** 1.0
**Date:** February 21, 2026
**Status:** Draft
**Parent Spec:** `docs/specs/PM_FEATURES.md` (Phase 1: Foundation)

---

## 1. Overview

This spec covers Phase 1 (Foundation) of the PM Features roadmap: the schema migration from implicit task dependencies to an explicit `TaskDependency` model, addition of sub-project hierarchy fields, new task PM fields, cascade engine updates, sub-project CRUD API endpoints, and the `ProjectTreeView` UI component.

### Goals

1. Replace the implicit Prisma M2M `dependsOn`/`dependents` relation with an explicit `TaskDependency` join table supporting dependency types (FS/SS/FF/SF) and lag/lead time.
2. Add sub-project hierarchy to `Project` with depth constraints, materialized path, and rollup fields.
3. Add milestone and progress tracking fields to `Task`.
4. Add `BaselineSnapshot` model for future Gantt baseline comparisons.
5. Update the cascade engine to use the explicit dependency model with type-awareness, lag handling, rollup recalculation, and milestone auto-completion.
6. Update **all** existing code that references the old implicit relation.
7. Build sub-project CRUD API endpoints and a reusable `ProjectTreeView` component.

### Non-Goals

- Gantt chart rendering (Phase 2)
- Critical path algorithm (Phase 3)
- PM Dashboard views (Phase 4)
- Auto-scheduling engine (Phase 3)

---

## 2. Architecture Decisions and Rationale

### 2.1 Explicit Join Table vs. Implicit M2M

**Decision:** Replace Prisma's implicit `dependsOn`/`dependents` self-referential M2M with an explicit `TaskDependency` model.

**Rationale:** The implicit M2M creates an `_TaskDependencies` table with only two columns (`A`, `B`) — no room for metadata. PM features require dependency type (FS/SS/FF/SF) and lag/lead time per dependency edge. An explicit join table is the only way to store this per-relationship data in Prisma. This is a breaking migration but it's a one-time cost that enables all future PM features.

**Trade-offs:**
- (+) Enables dependency types, lag, and future attributes (e.g., criticality flag)
- (+) Direct `TaskDependency` queries are simpler than navigating through nested relations
- (-) Breaking migration requires careful data preservation
- (-) Every file referencing `dependsOn`/`dependents` must be updated (12+ files)

### 2.2 Materialized Path for Sub-Project Hierarchy

**Decision:** Use a materialized `path` string (e.g., `"/rootId/childId/"`) plus `depth` integer for sub-project hierarchy, alongside the existing `parentProjectId` FK.

**Rationale:** Prisma doesn't support recursive CTEs natively. Materialized paths enable efficient subtree queries (`WHERE path LIKE '/rootId/%'`) without recursion. The `depth` field provides O(1) depth validation. The FK `parentProjectId` provides referential integrity and direct parent access.

**Trade-offs:**
- (+) O(1) depth checks, efficient subtree queries
- (+) No recursive queries needed for tree operations
- (-) `path` must be recomputed when reparenting (affects all descendants)
- (-) Denormalized data — `depth` and `path` must stay consistent with `parentProjectId`

### 2.3 Rollup Fields on Project

**Decision:** Store `rollupProgress` (Float) and `rollupStatus` (ProjectStatus) directly on the Project model, recomputed on each relevant event.

**Rationale:** Computing rollups on every read would require aggregating across potentially deep sub-trees. Pre-computing and caching on the model makes reads O(1). The write-time cost is acceptable because rollup recalculation only traverses the (shallow, max 3 levels) parent chain.

### 2.4 Max Depth of 3

**Decision:** Enforce max project nesting depth of 3 (depth 0, 1, 2) at the API level.

**Rationale:** From `PM_FEATURES.md` Section 2.2 — GTD philosophy values clarity over hierarchical complexity. Three levels (Root → Sub-Project → Work Package) provides sufficient decomposition without creating the "tickets-within-epics-within-initiatives" problem. Fixed constraint, not configurable.

### 2.5 Cascade Engine Approach

**Decision:** Extend the existing `onTaskComplete()` function in `src/lib/cascade.ts` rather than creating a separate PM cascade system.

**Rationale:** The cascade engine is the single source of truth for what happens when a task completes. Splitting cascade logic would create divergent behavior. All PM extensions (dependency type awareness, lag handling, rollup recalculation, milestone auto-completion) are natural extensions of the existing cascade flow.

### 2.6 Field Naming Convention

**Important:** The Task model field is `estimatedMins` (NOT `estimatedMinutes` as PM_FEATURES.md sometimes references). All code must use `estimatedMins`.

---

## 3. Schema Changes

### 3.1 New Enum: DependencyType

```prisma
enum DependencyType {
  FINISH_TO_START
  START_TO_START
  FINISH_TO_FINISH
  START_TO_FINISH
}
```

### 3.2 New Model: TaskDependency

Replaces the implicit `_TaskDependencies` join table.

```prisma
model TaskDependency {
  id              String         @id @default(cuid())
  predecessorId   String         @map("predecessor_id")
  predecessor     Task           @relation("Predecessor", fields: [predecessorId], references: [id], onDelete: Cascade)
  successorId     String         @map("successor_id")
  successor       Task           @relation("Successor", fields: [successorId], references: [id], onDelete: Cascade)
  type            DependencyType @default(FINISH_TO_START)
  lagMinutes      Int            @default(0)    // positive = lag, negative = lead

  @@unique([predecessorId, successorId])
  @@index([predecessorId])
  @@index([successorId])
  @@map("task_dependencies")
}
```

### 3.3 Task Model Changes

Remove:
```prisma
dependsOn  Task[] @relation("TaskDependencies")
dependents Task[] @relation("TaskDependencies")
```

Add:
```prisma
predecessors     TaskDependency[] @relation("Successor")
successors       TaskDependency[] @relation("Predecessor")
isMilestone      Boolean          @default(false)  @map("is_milestone")
percentComplete  Int              @default(0)      @map("percent_complete")  // 0-100
actualMinutes    Int?             @map("actual_minutes")
```

**Important:** The existing field is `estimatedMins` (NOT `estimatedMinutes`). Do not rename it.

### 3.4 Project Model Additions

The current Project model has no sub-project support. Add:

```prisma
// Sub-project hierarchy (self-relation)
parentProjectId  String?        @map("parent_project_id")
parentProject    Project?       @relation("ProjectChildren",
  fields: [parentProjectId], references: [id], onDelete: SetNull)
childProjects    Project[]      @relation("ProjectChildren")

// Hierarchy metadata
depth           Int            @default(0)
path            String         @default("")

// Rollup fields
rollupProgress  Float?         @map("rollup_progress")   // 0.0–1.0
rollupStatus    ProjectStatus? @map("rollup_status")

// Baseline snapshots relation
baselines       BaselineSnapshot[]
```

### 3.5 New Model: BaselineSnapshot

```prisma
model BaselineSnapshot {
  id           String   @id @default(cuid())
  projectId    String   @map("project_id")
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId       String   @map("user_id")
  user         User     @relation(fields: [userId], references: [id])
  name         String
  snapshotData Json     @map("snapshot_data")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([projectId])
  @@map("baseline_snapshots")
}
```

### 3.6 User Model Addition

Add the BaselineSnapshot back-relation:
```prisma
baselineSnapshots BaselineSnapshot[]
```

---

## 4. Data Migration

### 4.1 Strategy

This is a **breaking migration** that replaces the implicit Prisma M2M table `_TaskDependencies` with the explicit `task_dependencies` table. The migration must preserve all existing dependency relationships.

### 4.2 Prisma Implicit M2M Column Semantics

In Prisma's implicit M2M for `dependsOn Task[] @relation("TaskDependencies")` / `dependents Task[] @relation("TaskDependencies")`, the `_TaskDependencies` table stores `(A, B)` where:
- Column `A` = the task that has `dependsOn` (i.e., the **successor** — the task that depends)
- Column `B` = the task in the `dependents` side (i.e., the **predecessor** — the task being depended on)

If Task X has `dependsOn: [Task Y]`, the implicit table row is `(A=X, B=Y)`. Therefore:
- `predecessor_id = B` (the dependency)
- `successor_id = A` (the task that depends)

### 4.3 Migration SQL Steps

The Prisma migration SQL should:

1. Create the `DependencyType` enum.
2. Create the `task_dependencies` table with all columns, constraints, and indexes.
3. Copy data from the implicit `_TaskDependencies` table:
   ```sql
   INSERT INTO task_dependencies (id, predecessor_id, successor_id, type, lag_minutes)
   SELECT gen_random_uuid(), "B", "A", 'FINISH_TO_START', 0
   FROM "_TaskDependencies";
   ```
4. Drop the implicit `_TaskDependencies` table.
5. Add new fields to `Project` model (`parent_project_id`, `depth`, `path`, `rollup_progress`, `rollup_status`).
6. Add new fields to `Task` model (`is_milestone`, `percent_complete`, `actual_minutes`).
7. Create the `baseline_snapshots` table.

### 4.4 Migration Safety

- The migration must be wrapped in a transaction (Prisma migrations are transactional by default on PostgreSQL).
- If `_TaskDependencies` does not exist (fresh database), skip the data copy step. Use conditional SQL:
  ```sql
  DO $$
  BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_TaskDependencies') THEN
      INSERT INTO task_dependencies (id, predecessor_id, successor_id, type, lag_minutes)
      SELECT gen_random_uuid(), "B", "A", 'FINISH_TO_START'::\"DependencyType\", 0
      FROM "_TaskDependencies";
      DROP TABLE "_TaskDependencies";
    END IF;
  END $$;
  ```

### 4.5 Post-Migration Verification

After schema changes, run `npx prisma generate` to update the client. All TypeScript code must compile against the new client types. Run `npm run build` and `npm test` to verify.

---

## 5. Files Requiring Updates

Every file referencing the old `dependsOn`/`dependents` implicit relation must be updated to use the explicit `TaskDependency` model with `predecessors`/`successors` relations.

### 5.1 Complete File List

| File | What Changes |
|------|-------------|
| `prisma/schema.prisma` | Schema changes per Section 3 |
| `prisma/seed.ts` | Update seed data to use `TaskDependency.create()` instead of `dependsOn: { connect }` |
| `src/lib/cascade.ts` | Core cascade engine rewrite (Section 6) |
| `src/lib/services/task-service.ts` | `createTask()` dependency connection via `TaskDependency.create()` |
| `src/app/api/tasks/[id]/dependencies/route.ts` | Full rewrite for explicit model (Section 7) |
| `src/app/api/tasks/[id]/cascade-trace/route.ts` | No direct dependency references, but verify cascade events still trace correctly with new model |
| `src/app/api/tasks/route.ts` | Update `include` clauses in GET handler |
| `src/app/api/projects/[id]/route.ts` | Update nested task `include` clauses |
| `src/app/api/projects/[id]/tasks/route.ts` | Update dependency connection in POST + includes |
| `src/lib/validations/task.ts` | Update `createTaskSchema.dependsOnIds` → `predecessorIds` |
| `src/lib/history/snapshot.ts` | Update `TaskSnapshotState`, `takeSnapshot()`, `revertToSnapshot()`, `diffSnapshot()` |
| `src/components/projects/ProjectTaskItem.tsx` | Update `ProjectTask` interface and dependency display |
| `src/components/history/SnapshotDiff.tsx` | Update field labels for new dep format |
| `src/mcp/tools.ts` | Update MCP task completion cascade logic |

### 5.2 Relation Name Mapping

| Old (implicit M2M) | New (explicit model) |
|----|-----|
| `task.dependsOn` | `task.predecessors` → each has `.predecessor` (the Task) |
| `task.dependents` | `task.successors` → each has `.successor` (the Task) |
| `{ dependsOn: { connect: { id } } }` | `prisma.taskDependency.create({ data: { predecessorId, successorId } })` |
| `{ dependsOn: { disconnect: { id } } }` | `prisma.taskDependency.delete({ where: { predecessorId_successorId: {...} } })` |
| `include: { dependsOn: true }` | `include: { predecessors: { include: { predecessor: true } } }` |
| `include: { dependents: true }` | `include: { successors: { include: { successor: true } } }` |
| `dependsOn: { every: { status: COMPLETED } }` | `predecessors: { every: { predecessor: { status: COMPLETED } } }` |

---

## 6. Cascade Engine Updates

File: `src/lib/cascade.ts`

### 6.1 `computeNextAction()` Changes

**Current signature** (cascade.ts:13-23):
```typescript
export async function computeNextAction({
  projectId, projectType, dependsOnIds, userId,
}: { projectId: string; projectType: ProjectType; dependsOnIds?: string[]; userId: string; })
```

**Change:** Rename parameter `dependsOnIds` → `predecessorIds` for clarity. Internal logic remains the same — check if all predecessor tasks are completed. No dependency type check needed here because `computeNextAction` only determines if a task can be a next action at creation time.

**Callers to update:**
- `src/lib/services/task-service.ts:42-46` — passes `dependsOnIds` to `computeNextAction()`
- `src/app/api/projects/[id]/tasks/route.ts` — calls `computeNextAction()` with `dependsOnIds`

### 6.2 `onTaskComplete()` Changes

**Current behavior** (cascade.ts:63-212):
1. Marks task completed, includes `dependents` with their `dependsOn` (lines 74-93)
2. For each dependent: checks if all deps complete, promotes if so (lines 96-121)
3. For sequential projects: finds next task where `dependsOn: { every: { status: COMPLETED } }` (lines 124-158)
4. Checks project completion (lines 162-208)

**New behavior:**

1. Mark task completed and fetch project (no need to include dependents inline):
```typescript
const completedTask = await prisma.task.update({
  where: { id: taskId },
  data: { status: COMPLETED, isNextAction: false, completedAt: new Date() },
  include: { project: true },
});
```

2. Query successors via explicit model:
```typescript
const successorDeps = await prisma.taskDependency.findMany({
  where: { predecessorId: taskId },
  include: {
    successor: {
      include: {
        project: { select: { id: true, type: true, status: true } },
      },
    },
  },
});
```

3. For each successor dependency, apply **type-aware promotion**:

```typescript
for (const dep of successorDeps) {
  const successor = dep.successor;
  if (successor.status !== TaskStatus.NOT_STARTED &&
      successor.status !== TaskStatus.IN_PROGRESS) continue;

  switch (dep.type) {
    case 'FINISH_TO_START': {
      const allPredsComplete = await allPredecessorsComplete(successor.id, taskId);
      if (allPredsComplete && successor.project?.status === ProjectStatus.ACTIVE) {
        // For sequential projects, respect existing next action constraint
        if (successor.project.type === 'SEQUENTIAL') {
          const existingNext = await prisma.task.findFirst({
            where: {
              projectId: successor.project.id,
              isNextAction: true,
              status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
              id: { not: taskId },
            },
          });
          if (existingNext) continue;
        }

        const scheduledDate = dep.lagMinutes > 0
          ? addMinutes(completedTask.completedAt!, dep.lagMinutes)
          : undefined;
        await promoteTask(successor.id, { scheduledDate });
        result.promotedTasks.push({ id: successor.id, title: successor.title });

        // Milestone auto-completion
        if (successor.isMilestone) {
          await autoCompleteMilestone(successor.id, result);
        }
      }
      break;
    }
    case 'START_TO_START':
      // SS deps promote when predecessor STARTS, not completes.
      // On completion, no action needed — successor should already have been started.
      break;
    case 'FINISH_TO_FINISH':
      // FF: successor can finish when predecessor finishes.
      // No automatic promotion; this just unblocks completion.
      break;
    case 'START_TO_FINISH':
      // SF: rare. Predecessor start allows successor to finish.
      // On predecessor completion (implies it started), no additional action.
      break;
  }
}
```

4. For sequential project next-task promotion (replaces lines 124-158), update the dependency check:

**Current:**
```typescript
dependsOn: { every: { status: TaskStatus.COMPLETED } }
```

**New:**
```typescript
predecessors: {
  every: {
    predecessor: { status: TaskStatus.COMPLETED }
  }
}
```

5. After project completion check, **recalculate rollups**:
```typescript
if (completedTask.projectId) {
  await recalculateProjectRollups(completedTask.projectId);
}
```

### 6.3 New Helper: `allPredecessorsComplete()`

```typescript
async function allPredecessorsComplete(
  taskId: string,
  justCompletedTaskId: string
): Promise<boolean> {
  const predecessorDeps = await prisma.taskDependency.findMany({
    where: {
      successorId: taskId,
      type: DependencyType.FINISH_TO_START, // Only FS deps block promotion
    },
    include: { predecessor: { select: { id: true, status: true } } },
  });

  return predecessorDeps.every(
    dep => dep.predecessor.status === TaskStatus.COMPLETED ||
           dep.predecessor.id === justCompletedTaskId
  );
}
```

### 6.4 New Function: `recalculateProjectRollups()`

```typescript
async function recalculateProjectRollups(projectId: string): Promise<void>
```

**Logic:**
1. Load project with `childProjects` and count own tasks (total and completed).
2. `rollupProgress` = weighted average: `(ownCompleted + Σ(child.taskCount × child.rollupProgress)) / (ownTaskCount + Σ(child.taskCount))`.
3. `rollupStatus` = worst-case status among child projects. Priority order: `ON_HOLD` > `ACTIVE` > `COMPLETED`. If all children and own status are `COMPLETED`, rollup is `COMPLETED`.
4. If `totalWeight === 0` (no tasks in entire subtree), set `rollupProgress = null`.
5. Update project record.
6. If project has `parentProjectId`, recurse upward.

**Called from:** End of `onTaskComplete()` when `completedTask.projectId` exists.

### 6.5 New Function: `autoCompleteMilestone()`

Milestones have zero duration — they auto-complete when all FS predecessors are done:

```typescript
async function autoCompleteMilestone(
  milestoneId: string,
  result: CascadeResult
): Promise<void> {
  await prisma.task.update({
    where: { id: milestoneId },
    data: {
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      isNextAction: false,
      percentComplete: 100,
    },
  });
  // Recursively cascade from this milestone's completion
  const milestoneResult = await onTaskComplete(milestoneId, userId);
  result.promotedTasks.push(...milestoneResult.promotedTasks);
  result.completedProjects.push(...milestoneResult.completedProjects);
  result.updatedGoals.push(...milestoneResult.updatedGoals);
}
```

### 6.6 Lag/Lead Time Handling

When promoting a successor with lag:
- `lagMinutes > 0`: Set `successor.scheduledDate = predecessor.completedAt + lagMinutes`.
- `lagMinutes < 0` (lead time): Successor could have started before predecessor finished. Only set `scheduledDate` if not already set.
- `lagMinutes === 0`: No date change (current behavior).

Use a simple helper:
```typescript
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
```

---

## 7. API Endpoints

### 7.1 POST /api/tasks/:id/dependencies — Add Dependency (Update Existing)

**File:** `src/app/api/tasks/[id]/dependencies/route.ts`

**Current:** Accepts `{ dependsOnId }`, uses implicit M2M connect (lines 18-35).

**New request body:**
```json
{
  "predecessorId": "string",
  "type": "FINISH_TO_START",
  "lagMinutes": 0
}
```

**Validation (Zod):**
```typescript
const addDependencySchema = z.object({
  predecessorId: z.string().min(1),
  type: z.enum([
    'FINISH_TO_START', 'START_TO_START',
    'FINISH_TO_FINISH', 'START_TO_FINISH'
  ]).default('FINISH_TO_START'),
  lagMinutes: z.number().int().default(0),
});
```

**Logic:**
1. Verify both tasks exist and belong to the user.
2. Prevent self-dependency: `predecessorId !== params.id`.
3. Prevent circular dependencies: BFS/DFS traversal of predecessor chain from `predecessorId` to check if `params.id` appears as an ancestor.
4. Create `TaskDependency` record.
5. Set the successor task's `isNextAction = false` if predecessor is not completed (for FS dependencies).
6. Return `201 Created` with the `TaskDependency` record including predecessor/successor details.

**Error cases:**
- `400` — self-dependency, circular dependency detected, duplicate dependency (unique constraint)
- `404` — task or predecessor task not found

### 7.2 DELETE /api/tasks/:id/dependencies/:depId — Remove Dependency

**New route file:** `src/app/api/tasks/[id]/dependencies/[depId]/route.ts`

**Logic:**
1. Verify the `TaskDependency` record exists and the successor task (`params.id`) belongs to the user.
2. Delete the `TaskDependency` record.
3. Re-evaluate `isNextAction` for the successor: if all remaining FS predecessors are complete and the task is in an ACTIVE project, promote it.
4. Return `200 OK`.

**Error cases:**
- `404` — dependency not found or task not found

### 7.3 POST /api/projects/:id/children — Create Sub-Project

**New route file:** `src/app/api/projects/[id]/children/route.ts`

**Request body:**
```json
{
  "title": "string",
  "description": "string?",
  "type": "SEQUENTIAL | PARALLEL | SINGLE_ACTIONS",
  "outcome": "string?"
}
```

**Validation (Zod):**
```typescript
const createSubProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['SEQUENTIAL', 'PARALLEL', 'SINGLE_ACTIONS']).default('SEQUENTIAL'),
  outcome: z.string().optional(),
});
```

**Logic:**
1. Load parent project; verify it belongs to the user.
2. Enforce max depth: `parent.depth + 1 <= 2` (0-indexed, so depth 0/1/2 = 3 levels). Return `400` if exceeded.
3. Compute child fields:
   - `depth = parent.depth + 1`
   - `path = parent.path + parent.id + "/"`
4. Inherit `areaId` and `goalId` from parent.
5. Inherit `type` from parent by default (can be overridden by request body).
6. Create project with `parentProjectId = params.id` and computed fields.
7. Return `201 Created` with the new project.

**Error cases:**
- `400` — max depth exceeded (parent.depth >= 2)
- `404` — parent project not found

### 7.4 GET /api/projects/:id/tree — Project Tree

**New route file:** `src/app/api/projects/[id]/tree/route.ts`

**Response shape:**
```json
{
  "id": "...",
  "title": "...",
  "status": "ACTIVE",
  "depth": 0,
  "rollupProgress": 0.72,
  "rollupStatus": "ACTIVE",
  "taskCount": 5,
  "completedTaskCount": 3,
  "children": [
    {
      "id": "...",
      "title": "...",
      "depth": 1,
      "rollupProgress": 0.95,
      "taskCount": 10,
      "completedTaskCount": 9,
      "children": [...]
    }
  ]
}
```

**Logic:**
1. Load root project (verify ownership).
2. Recursively load all descendants using `childProjects` recursive includes (Prisma supports 2 levels deep, which matches our max depth of 3).
3. For each node, include task count and completed task count.
4. Return nested tree structure.

### 7.5 PATCH /api/projects/:id/move — Reparent Project

**New route file:** `src/app/api/projects/[id]/move/route.ts`

**Request body:**
```json
{
  "newParentId": "string | null"
}
```

**Validation:**
```typescript
const moveProjectSchema = z.object({
  newParentId: z.string().nullable(),
});
```

**Logic:**
1. Load the project and the new parent (if not null).
2. Prevent circular reparenting: new parent must not be a descendant of this project. Check via `path LIKE '...projectId...'` or traversal.
3. Enforce max depth: compute new depth; if this project has children, ensure `maxDescendantDepth + newDepth - currentDepth <= 2`.
4. Update `parentProjectId`, recompute `depth` and `path` for this project and all descendants (batch update using `path LIKE` query).
5. Recalculate rollups on both old parent (if any) and new parent.
6. Return `200 OK` with updated project.

**Error cases:**
- `400` — circular reparenting, max depth exceeded
- `404` — project or new parent not found

---

## 8. Validation Schemas

### 8.1 New File: `src/lib/validations/dependency.ts`

```typescript
import { z } from 'zod';

export const addDependencySchema = z.object({
  predecessorId: z.string().min(1),
  type: z.enum([
    'FINISH_TO_START',
    'START_TO_START',
    'FINISH_TO_FINISH',
    'START_TO_FINISH',
  ]).default('FINISH_TO_START'),
  lagMinutes: z.number().int().default(0),
});

export type AddDependencyInput = z.infer<typeof addDependencySchema>;
```

### 8.2 New File: `src/lib/validations/sub-project.ts`

```typescript
import { z } from 'zod';

export const createSubProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['SEQUENTIAL', 'PARALLEL', 'SINGLE_ACTIONS']).optional(),
  outcome: z.string().optional(),
});

export const moveProjectSchema = z.object({
  newParentId: z.string().nullable(),
});

export type CreateSubProjectInput = z.infer<typeof createSubProjectSchema>;
export type MoveProjectInput = z.infer<typeof moveProjectSchema>;
```

### 8.3 Update: `src/lib/validations/task.ts`

Rename `dependsOnIds` → `predecessorIds` in `createTaskSchema`. The field contains predecessor task IDs (tasks that must complete before this one).

---

## 9. Snapshot and History System Updates

### 9.1 `TaskSnapshotState` Interface (snapshot.ts:13-26)

**Current:**
```typescript
export interface TaskSnapshotState {
  // ... other fields ...
  dependsOnIds: string[];
}
```

**New:** Rename to `predecessorIds` but support reading old snapshots:
```typescript
export interface TaskSnapshotState {
  // ... other fields ...
  predecessorIds: string[];
  dependsOnIds?: string[]; // Legacy field — read-only for old snapshots
}
```

### 9.2 `takeSnapshot()` (snapshot.ts:78-114)

**Current:** Queries `task.dependsOn` and extracts IDs.

**New:** Query `task.predecessors` → extract `predecessor.id`:
```typescript
const task = await client.task.findUniqueOrThrow({
  where: { id: taskId },
  include: {
    predecessors: { select: { predecessorId: true } },
  },
});
const predecessorIds = task.predecessors.map(d => d.predecessorId);
```

### 9.3 `revertToSnapshot()` (snapshot.ts:121-236)

**Current:** Uses `dependsOn: { connect, disconnect }` for dependency changes (lines 196-206).

**New:** Use `TaskDependency.create()` and `TaskDependency.deleteMany()`:
```typescript
// Compute added/removed dependencies
const snapshotPredecessorIds = snapshotState.predecessorIds
  ?? snapshotState.dependsOnIds  // Backward compat with old snapshots
  ?? [];

const addedDeps = snapshotPredecessorIds.filter(id => !currentPredecessorIds.includes(id));
const removedDeps = currentPredecessorIds.filter(id => !snapshotPredecessorIds.includes(id));

if (addedDeps.length > 0) {
  await tx.taskDependency.createMany({
    data: addedDeps.map(predId => ({
      predecessorId: predId,
      successorId: snapshot.taskId,
      type: 'FINISH_TO_START',
      lagMinutes: 0,
    })),
    skipDuplicates: true,
  });
}

if (removedDeps.length > 0) {
  await tx.taskDependency.deleteMany({
    where: {
      successorId: snapshot.taskId,
      predecessorId: { in: removedDeps },
    },
  });
}
```

### 9.4 `diffSnapshot()` (snapshot.ts:316-353)

**Current:** Includes `dependsOn: { select: { id: true } }`.

**New:** Include `predecessors: { select: { predecessorId: true } }` and extract IDs.

---

## 10. UI Components

### 10.1 ProjectTreeView Component

**File:** `src/components/projects/ProjectTreeView.tsx`

**Props:**
```typescript
interface ProjectTreeNode {
  id: string;
  title: string;
  status: ProjectStatus;
  depth: number;
  rollupProgress: number | null;
  rollupStatus: ProjectStatus | null;
  taskCount: number;
  completedTaskCount: number;
  children: ProjectTreeNode[];
}

interface ProjectTreeViewProps {
  projects: ProjectTreeNode[];
  onSelectProject: (projectId: string) => void;
  selectedProjectId?: string;
}
```

**Behavior:**
- Render projects as an expandable tree with indentation (24px per depth level).
- Each node shows: expand/collapse chevron (only if has children), status dot, project name, progress bar (4px height), rollup percentage.
- Click navigates to project detail page.
- Expand/collapse state persisted in local component state.
- Projects without children render as leaf nodes (no chevron).

**shadcn/ui primitives to use:**
- `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` for expand/collapse
- `Progress` for progress bars
- `Badge` for status indicators

**Visual spec:**
```
▼ Build Tandem v2                    [=========>   ] 72%  ACTIVE
    ▼ Backend API                     [============>] 95%  ACTIVE
        Cascade Engine               [=============] 100% COMPLETE
        REST Endpoints               [==========>  ]  85% ACTIVE
    ▶ Frontend UI                     [=====>       ]  45% ACTIVE
```

Row height: 36px. Hover: `bg-slate-100`. Selected: `bg-blue-100` with 3px left blue border.

### 10.2 Project List Page Update

**File:** `src/app/(dashboard)/projects/page.tsx`

- Query projects with `childProjects` included.
- Root projects (`parentProjectId === null`) render in the list.
- Projects with children use `ProjectTreeView`.
- Projects without children render as flat list items (existing behavior).

### 10.3 Project Detail Page Update

**File:** `src/app/(dashboard)/projects/[id]/page.tsx`

- Add a "Sub-Projects" section below the task list when the project has children.
- Render children using `ProjectTreeView`.
- Add a "Create Sub-Project" button that opens a dialog/form.

### 10.4 ProjectTaskItem Update

**File:** `src/components/projects/ProjectTaskItem.tsx`

Update the `ProjectTask` interface (currently lines 28-41):

```typescript
// Old:
dependsOn?: Array<{ id: string; title: string; status: string }>;
dependents?: Array<{ id: string; title: string; status: string }>;

// New:
predecessors?: Array<{
  id: string;  // TaskDependency id
  type: string;
  lagMinutes: number;
  predecessor: { id: string; title: string; status: string };
}>;
successors?: Array<{
  id: string;
  type: string;
  lagMinutes: number;
  successor: { id: string; title: string; status: string };
}>;
```

Update the dependency display sections (lines 346-380):
- "Depends on" label → render `predecessors.map(d => d.predecessor)`
- "Blocks" label → render `successors.map(d => d.successor)`
- Optionally show dependency type badge next to each dependency

---

## 11. MCP Tools Update

**File:** `src/mcp/tools.ts`

The MCP tools contain inline cascade logic that duplicates `onTaskComplete()`. After the migration, this code must be updated to use the explicit `TaskDependency` model.

**Recommendation:** Refactor MCP task completion to call `completeTask()` from `src/lib/services/task-service.ts` instead of reimplementing cascade logic inline. This ensures consistent behavior and reduces the surface area of the migration.

If refactoring is out of scope for Phase 1, update the inline cascade logic to:
- Query `taskDependency` instead of `dependents`
- Use `predecessors`/`successors` relation names
- Apply the same type-aware promotion logic as the cascade engine

---

## 12. Edge Cases and Error Handling

### 12.1 Circular Dependency Detection

When adding a dependency via POST `/api/tasks/:id/dependencies`, traverse the predecessor chain from `predecessorId` to check if `successorId` (the current task, `params.id`) appears as an ancestor. Use BFS on the `TaskDependency` graph. Return a descriptive error: `"Circular dependency detected: Task A → Task B → Task A"`.

### 12.2 Orphaned Dependencies on Task Deletion

`TaskDependency` uses `onDelete: Cascade` on both FK relations. Deleting a task automatically removes all its dependency records. After deletion, callers should re-evaluate `isNextAction` for any tasks that were successors of the deleted task (they may now be unblocked).

### 12.3 Sub-Project Depth Overflow on Reparent

When moving a project that has its own sub-tree, compute the maximum depth of all descendants. If `newParentDepth + 1 + maxRelativeDescendantDepth > 2`, reject the move with `400`.

### 12.4 Rollup Recalculation with No Tasks

If a project and all its children have zero tasks, `rollupProgress` = `null` (not 0). Avoid division by zero in the weighted average calculation.

### 12.5 Concurrent Rollup Updates

Multiple task completions in the same project tree could trigger concurrent rollup recalculations. For Phase 1, sequential execution within each `onTaskComplete()` call is acceptable. If race conditions emerge, serialize rollup updates per root project in a future iteration.

### 12.6 Migration with No Existing Dependencies

If the `_TaskDependencies` table is empty or doesn't exist (fresh install), the migration should succeed without error. Use `IF EXISTS` guards on the copy and drop statements.

### 12.7 Snapshot System Backward Compatibility

The `TaskSnapshotState` interface includes `dependsOnIds: string[]`. After migration:
- New snapshots store `predecessorIds` (extracted from `TaskDependency` records).
- Old snapshots in the database still have `dependsOnIds` in their JSON. The revert function must handle both field names: read `predecessorIds ?? dependsOnIds ?? []`.
- `revertToSnapshot()` must create/delete `TaskDependency` records instead of using implicit M2M connect/disconnect.

### 12.8 Milestone Cascade Depth

A milestone auto-completion triggers `onTaskComplete()` recursively. If multiple milestones chain (milestone A → milestone B), this could create deep recursion. Guard with a maximum cascade depth (e.g., 20 levels) consistent with the cascade-trace route's depth guard of 10.

### 12.9 Duplicate Dependency Prevention

The `@@unique([predecessorId, successorId])` constraint prevents duplicate dependencies at the database level. The API should catch the Prisma unique constraint error (`P2002`) and return a friendly `400` error: "Dependency already exists between these tasks."

### 12.10 Cross-Project Dependencies

Tasks in different projects (including sibling sub-projects) can have dependencies. The cascade engine already handles cross-project promotion. When promoting a successor in a different project, still check project status (`ACTIVE`) and project type (`SEQUENTIAL` constraints) as today.

---

## 13. Acceptance Criteria

### Schema & Migration
- [ ] `DependencyType` enum exists with all 4 types: FINISH_TO_START, START_TO_START, FINISH_TO_FINISH, START_TO_FINISH
- [ ] `TaskDependency` model exists with `predecessorId`, `successorId`, `type`, `lagMinutes`
- [ ] `TaskDependency` has `@@unique([predecessorId, successorId])` and indexes on both FKs
- [ ] Task model has `predecessors`/`successors` relations (explicit) — old `dependsOn`/`dependents` removed
- [ ] Task model has `isMilestone` (Boolean, default false), `percentComplete` (Int, default 0), `actualMinutes` (Int?, nullable) fields
- [ ] Project model has `parentProjectId` (self-relation), `depth` (Int, default 0), `path` (String, default ""), `rollupProgress` (Float?), `rollupStatus` (ProjectStatus?)
- [ ] `BaselineSnapshot` model exists with `id`, `projectId`, `userId`, `name`, `snapshotData` (Json), `createdAt`
- [ ] User model has `baselineSnapshots` relation
- [ ] Migration successfully copies data from `_TaskDependencies` to `task_dependencies` (mapping A→successor, B→predecessor)
- [ ] Migration succeeds on fresh database with no `_TaskDependencies` table
- [ ] `npx prisma generate` succeeds
- [ ] `npm run build` compiles without errors

### Cascade Engine
- [ ] `onTaskComplete()` uses `TaskDependency` model for successor lookup
- [ ] FINISH_TO_START: successor promoted only when ALL FS predecessors are complete
- [ ] START_TO_START: no promotion on predecessor completion (SS deps promote on start, which is out of scope)
- [ ] FINISH_TO_FINISH: no automatic promotion on predecessor completion
- [ ] START_TO_FINISH: no automatic promotion on predecessor completion
- [ ] Lag time: successor `scheduledDate` set to `predecessor.completedAt + lagMinutes` when `lagMinutes > 0`
- [ ] Lead time: `scheduledDate` only set if not already set when `lagMinutes < 0`
- [ ] Zero lag: no date change (preserves current behavior)
- [ ] Sequential project promotion (Section 2, step 2 of cascade) uses explicit dependency check
- [ ] Sub-project rollup: `rollupProgress` and `rollupStatus` recalculated up parent chain on task completion
- [ ] Rollup with no tasks: `rollupProgress` is null, not 0
- [ ] Milestone auto-completion: milestones with `isMilestone=true` auto-complete when all FS predecessors complete
- [ ] Milestone cascade: completing a milestone triggers `onTaskComplete()` recursively for its successors

### Code Migration
- [ ] Zero references to `dependsOn`/`dependents` implicit M2M remain in TypeScript source (search: `dependsOn`, `dependents`, `TaskDependencies` in `src/`)
- [ ] All `include` clauses updated for new relation shape
- [ ] `task-service.ts` `createTask()` creates `TaskDependency` records instead of `dependsOn: { connect }`
- [ ] Snapshot system (`snapshot.ts`) captures/reverts dependencies via explicit model
- [ ] Snapshot backward compat: `revertToSnapshot()` handles both `predecessorIds` and legacy `dependsOnIds` in snapshot JSON
- [ ] MCP tools (`mcp/tools.ts`) updated for explicit dependency model
- [ ] Seed data (`prisma/seed.ts`) updated
- [ ] `ProjectTaskItem.tsx` renders dependencies via new `predecessors`/`successors` shape
- [ ] Validation schemas updated (`dependsOnIds` → `predecessorIds`)

### API Endpoints
- [ ] `POST /api/tasks/:id/dependencies` accepts `{ predecessorId, type?, lagMinutes? }`
- [ ] `POST /api/tasks/:id/dependencies` creates `TaskDependency` record
- [ ] `POST /api/tasks/:id/dependencies` returns 400 for self-dependency
- [ ] `POST /api/tasks/:id/dependencies` returns 400 for circular dependency with descriptive message
- [ ] `POST /api/tasks/:id/dependencies` returns 400 for duplicate (catches P2002)
- [ ] `POST /api/tasks/:id/dependencies` sets successor `isNextAction=false` when predecessor incomplete
- [ ] `DELETE /api/tasks/:id/dependencies/:depId` removes the dependency
- [ ] `DELETE /api/tasks/:id/dependencies/:depId` re-evaluates successor `isNextAction`
- [ ] `POST /api/projects/:id/children` creates sub-project with correct `depth` and `path`
- [ ] `POST /api/projects/:id/children` inherits `areaId`, `goalId`, `type` from parent
- [ ] `POST /api/projects/:id/children` returns 400 when parent.depth >= 2 (max depth enforcement)
- [ ] `GET /api/projects/:id/tree` returns nested tree with rollup data, task counts
- [ ] `PATCH /api/projects/:id/move` reparents project, recomputes `depth`/`path` for entire subtree
- [ ] `PATCH /api/projects/:id/move` prevents circular reparenting
- [ ] `PATCH /api/projects/:id/move` enforces max depth for moved subtree
- [ ] `PATCH /api/projects/:id/move` recalculates rollups on old and new parent

### UI
- [ ] `ProjectTreeView` component renders expandable tree with indentation (24px/level), status dots, progress bars
- [ ] `ProjectTreeView` expand/collapse works for projects with children
- [ ] `ProjectTreeView` leaf nodes render without expand chevron
- [ ] Project list page shows tree view for projects with children
- [ ] Project detail page shows sub-projects section when project has children
- [ ] Project detail page has "Create Sub-Project" action

### Tests
- [ ] `npm test` passes with all existing tests updated for new schema
- [ ] `npm run build` succeeds with zero TypeScript errors
