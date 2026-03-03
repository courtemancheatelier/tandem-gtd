# Optimistic Concurrency Control for Team Projects

> **Status:** Draft
> **Author:** Jason Courtemanche
> **Created:** 2026-02-27
> **Depends on:** TEAMS spec (v1.1+)
> **Blocks:** Load testing concurrency scenarios

## Problem

Tandem currently has no protection against concurrent modifications to shared resources. When two users on the same team edit the same task, the last write silently wins — the first user's changes disappear with no warning. The event sourcing system records what happened after the fact, but doesn't prevent the conflict.

This is especially dangerous with the cascade engine. User A could be editing a task that User B completes at the same time, triggering cascades that promote dependent tasks and potentially complete projects. Without concurrency control, the cascade's status change can be silently overwritten by User A's stale edit, leaving the system in an inconsistent state where event history says the task was completed but it's actually still open.

### Why Not Pessimistic Locking (Checkout/Check-in)?

Pessimistic locking — where editing a task locks it for everyone else — is the wrong model for a task manager. Tasks are lightweight, fast-moving objects. People glance at them, tweak a field, and move on. Locking creates:

- "This task is being edited by Sarah" blocking messages when Sarah just has the tab open
- Lock timeout complexity (how long before we force-unlock?)
- Deadlock potential when the cascade engine needs to update a task a user has locked
- A fundamentally heavier UX that doesn't match the speed of GTD workflows

Optimistic concurrency is the right fit: assume conflicts are rare, let everyone edit freely, and catch the occasional collision when it happens.

---

## Solution: Version-Based Optimistic Concurrency

### Schema Change

Add a `version` integer to every entity that supports concurrent modification:

```prisma
model Task {
  // ... existing fields ...
  version    Int      @default(1)
}

model Project {
  // ... existing fields ...
  version    Int      @default(1)
}

model WikiArticle {
  // ... existing fields ...
  version    Int      @default(1)
}
```

**Why `version` instead of `updatedAt`?** Timestamps can collide at millisecond resolution under high concurrency. An integer that increments by exactly 1 on every write is unambiguous and trivially comparable. It also gives clients a clean way to display "this has been modified N times" if useful.

### Migration

```sql
ALTER TABLE "Task" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Project" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WikiArticle" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

No backfill needed — every existing row starts at version 1 and increments from there.

---

## API Contract

### Request: Client Sends Version

Every PATCH/PUT request on a versioned entity must include the `version` the client last read:

```json
PATCH /api/tasks
{
  "id": "task_abc123",
  "version": 4,
  "title": "Updated title",
  "notes": "New notes"
}
```

### Response: Success (200)

The response includes the new version so the client can use it for subsequent edits:

```json
{
  "id": "task_abc123",
  "version": 5,
  "title": "Updated title",
  "notes": "New notes"
}
```

### Response: Conflict (409)

When the client's version doesn't match the current version:

```json
{
  "error": "CONFLICT",
  "message": "This task has been modified since you last loaded it.",
  "currentVersion": 5,
  "currentState": {
    "id": "task_abc123",
    "version": 5,
    "title": "Title someone else changed",
    "status": "COMPLETED",
    "updatedAt": "2026-02-27T15:30:00Z",
    "updatedBy": {
      "id": "user_xyz",
      "name": "Sarah"
    }
  }
}
```

Returning the current state in the 409 gives the client everything it needs to show the user what changed and let them decide what to do.

### Version Omitted — Backward Compatibility

During rollout, some clients (MCP, older UI versions) may not send a version. Handle this gracefully:

- **MCP tool calls:** Don't require version. MCP interactions are typically create-or-complete operations, not long-lived edit sessions. The risk of stale reads is low.
- **API clients without version:** Log a deprecation warning. Apply the write without conflict checking. Set a deadline for requiring version in a future release.
- **Web UI:** Always send version. The UI reads it on load and includes it in every mutation.

---

## Server Implementation

### Atomic Version Check + Update

The core operation must be atomic — check the version and apply the update in a single database call to avoid a TOCTOU race:

```typescript
async function updateTaskWithVersion(
  taskId: string,
  expectedVersion: number,
  updates: Partial<TaskUpdateInput>,
  userId: string
): Promise<Task> {
  // Atomic: WHERE id AND version match, increment version
  const result = await prisma.task.updateMany({
    where: {
      id: taskId,
      version: expectedVersion,
    },
    data: {
      ...updates,
      version: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  if (result.count === 0) {
    // Either the task doesn't exist or the version doesn't match
    const current = await prisma.task.findUnique({
      where: { id: taskId },
      include: { updatedByUser: true },
    });

    if (!current) {
      throw new NotFoundError("Task not found");
    }

    // Version mismatch — return conflict with current state
    throw new ConflictError(
      "This task has been modified since you last loaded it.",
      current
    );
  }

  // Fetch and return the updated task
  return prisma.task.findUniqueOrThrow({
    where: { id: taskId },
  });
}
```

**Why `updateMany` instead of `update`?** Prisma's `update` throws if the `where` clause doesn't match, but it can only filter on unique fields. `updateMany` with a compound `where` (id + version) returns `{ count: 0 }` cleanly when the version doesn't match, letting us distinguish "not found" from "conflict" in the follow-up query.

### Cascade Engine Integration

The cascade engine runs as SYSTEM and must always succeed — it can't be blocked by a stale client version. When the cascade engine updates a task (promoting it, completing a project), it should:

1. **Skip version checking** — the cascade operates on server-side truth, not a client's stale read
2. **Still increment the version** — so any client holding a stale version gets a 409 on their next save
3. **Record the event** — the existing event sourcing captures the cascade action for audit

```typescript
async function cascadePromoteTask(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      isNextAction: true,
      version: { increment: 1 },
    },
  });

  // Write event as usual
  await writeTaskEvent(/* ... */);
}
```

This means: if User A is editing a task and the cascade engine promotes it between A's read and write, A gets a 409 with the new state showing `isNextAction: true`. A can then re-apply their title change on top of the promoted state.

---

## Client-Side Conflict Resolution

### UI Flow

When the client receives a 409:

1. **Pause the optimistic update** — revert the local state to what the server returned in the 409
2. **Show a conflict toast/dialog** with context:
   - "Sarah completed this task while you were editing it."
   - "This task was updated by the system (cascade promotion)."
3. **Offer resolution options** based on what changed:

#### Non-Overlapping Changes (Auto-Mergeable)

If User A changed `title` and User B changed `notes`, these don't conflict. The client can:
- Auto-merge: re-submit A's `title` change against the new version
- Show a brief "merged with Sarah's changes" toast

```typescript
function canAutoMerge(
  myChanges: Record<string, unknown>,
  theirChanges: Record<string, unknown>
): boolean {
  const myFields = Object.keys(myChanges);
  const theirFields = Object.keys(theirChanges);
  return !myFields.some(f => theirFields.includes(f));
}
```

#### Overlapping Changes (Manual Resolution)

If both users changed the same field, show a side-by-side:

```
┌─────────────────────────────────────────────────┐
│  ⚠️ Conflict: Task was modified by Sarah        │
│                                                  │
│  Title                                          │
│  ┌──────────────┐    ┌──────────────┐           │
│  │ Your version │    │ Sarah's ver. │           │
│  │ "Call venue  │    │ "Call venue  │           │
│  │  tomorrow"   │    │  ASAP"       │           │
│  └──────────────┘    └──────────────┘           │
│                                                  │
│  [Keep Mine]  [Keep Theirs]  [Cancel]           │
└─────────────────────────────────────────────────┘
```

#### Status Conflicts (Special Handling)

If the conflict is a status change (especially completion + cascade), always show the full picture:

```
┌─────────────────────────────────────────────────┐
│  ⚠️ This task was completed by Sarah            │
│                                                  │
│  The cascade engine has already promoted         │
│  "Attach sleeves" as the next action.            │
│                                                  │
│  Your unsaved changes:                           │
│  • Title: "Sew shoulder seams carefully"         │
│                                                  │
│  [Discard My Changes]  [Reopen & Apply]         │
└─────────────────────────────────────────────────┘
```

"Reopen & Apply" would reopen the task, revert the cascade, and apply the edit — a destructive action that should require confirmation.

---

## What Gets Versioned

| Entity | Versioned | Rationale |
|--------|-----------|-----------|
| Task | ✅ Yes | Primary concurrent editing target in team projects |
| Project | ✅ Yes | Settings, outcome, status can be edited by multiple team members |
| WikiArticle | ✅ Yes | Already has version history; version field formalizes it for conflict detection |
| InboxItem | ❌ No | Personal only, single-user access |
| Goal | ❌ No | Rarely edited concurrently; owned by one person |
| Context | ❌ No | Personal only |
| WeeklyReview | ❌ No | Personal only |

---

## Edge Cases

### Rapid Self-Edits

A single user making fast successive edits (debounced auto-save) could conflict with themselves if the first save hasn't returned before the second fires. The client should:
- Queue mutations sequentially per entity
- Wait for the previous save's response (and new version) before sending the next

### Bulk Operations

Bulk updates (e.g., changing context on 50 tasks) should use a batch endpoint that handles version conflicts per-item and returns a result array:

```json
{
  "succeeded": [{ "id": "task_1", "version": 6 }, ...],
  "conflicted": [{ "id": "task_5", "currentVersion": 8, "expectedVersion": 7 }],
  "failed": []
}
```

### Task Revert

Reverting a task to a snapshot should increment the version like any other write. The revert function already operates within a transaction and records events — just add version increment.

### MCP / AI Operations

MCP tool calls operate on the latest server state (they don't hold stale reads), so version conflicts should be rare. The MCP layer should:
- Read the current version immediately before writing
- Include it in the update call
- On 409, retry once with the fresh version (since MCP doesn't have "user's intended changes" to preserve — it's just executing a command)

---

## Implementation Order

1. **Schema migration** — Add `version` column to Task, Project, WikiArticle
2. **Server-side version check** — Implement atomic check-and-update in the API routes for Task PATCH
3. **Cascade engine update** — Ensure cascade always increments version, never checks it
4. **API response update** — Include `version` in all GET and mutation responses
5. **Client-side version tracking** — Store version from reads, send it on writes
6. **409 handling in UI** — Toast notification with conflict details
7. **Auto-merge for non-overlapping changes** — Reduce friction for the common case
8. **Manual conflict resolution UI** — Side-by-side for overlapping field changes
9. **Extend to Project and WikiArticle** — Same pattern, same UI
10. **Load testing** — Run concurrency scenarios from SPEC-load-testing-tool.md

---

## Open Questions

- Should we add a `lastModifiedBy` field alongside `version` to make conflict messages more helpful, or derive it from event history?
- Do we want real-time push (WebSockets/SSE) to notify clients when a task they're viewing gets modified, reducing the window for stale reads?
- Should auto-merge be opt-in (user preference) or always-on for non-overlapping changes?
- What's the right retry limit for MCP 409s before surfacing the conflict to the AI response?
