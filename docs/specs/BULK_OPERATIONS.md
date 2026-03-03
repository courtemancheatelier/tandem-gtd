# Bulk Operations — Multi-Select & Batch Actions

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Weekly review, inbox processing, and project reorganization frequently require acting on multiple items at once:

- "Complete all 5 tasks I finished this week but forgot to check off"
- "Move these 8 unrelated tasks into a new project"
- "Change all @Office tasks to @Home because I'm going remote"
- "Delete these 12 stale inbox items"
- "Set all tasks in this project to HIGH energy"

Currently, each of these requires clicking into each item individually. For a weekly review touching 20+ items, this turns a 10-minute review into 30 minutes of clicking.

### What Exists

- Task completion is handled one-at-a-time via `POST /api/tasks/{id}/complete` with cascade logic
- Task updates go through `PATCH /api/tasks` with individual task IDs
- The `SnapshotReason.BULK_OPERATION` enum value exists in the schema, anticipating bulk operations
- The `EventSource` enum includes `MANUAL`, `CASCADE`, `IMPORT` — bulk operations would use `MANUAL` (user-initiated)
- `TaskCard` (`src/components/tasks/TaskCard.tsx`) has `onComplete`, `onUpdate`, `onDelete` callbacks
- No multi-select, checkbox column, or floating action bar exists anywhere in the UI

### What Done Looks Like

1. Users can select multiple tasks on Do Now, Inbox, and Project task list pages.
2. A floating action bar appears showing the selection count and available batch actions.
3. Batch actions (complete, delete, move, change context/energy/due date) execute atomically in a single transaction.
4. Keyboard-driven selection works alongside mouse selection.
5. The system handles cascade logic correctly for batch completions.

---

## 2. Data Model Changes

### No New Models Needed

Bulk operations wrap existing service functions (`completeTask`, `updateTask`) in a transaction. The existing event history system records each individual change with its own event.

The `SnapshotReason.BULK_OPERATION` value already exists for creating pre-bulk snapshots if undo support is added later.

---

## 3. Selection System

### 3.1 Selection State

Selection state lives in a React context, scoped to the current page. It does not persist across navigation — leaving a page clears the selection.

```typescript
// src/lib/hooks/use-selection.ts

interface UseSelectionOptions {
  items: Array<{ id: string }>;
}

interface UseSelectionReturn {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectRange: (fromId: string, toId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectionCount: number;
  isSelectionMode: boolean;
}

export function useSelection({ items }: UseSelectionOptions): UseSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectRange(fromId: string, toId: string) {
    const fromIndex = items.findIndex((i) => i.id === fromId);
    const toIndex = items.findIndex((i) => i.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        next.add(items[i].id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  // Clean up stale selections when items change
  useEffect(() => {
    const validIds = new Set(items.map((i) => i.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  return {
    selectedIds,
    isSelected: (id: string) => selectedIds.has(id),
    toggle,
    selectRange,
    selectAll,
    deselectAll,
    selectionCount: selectedIds.size,
    isSelectionMode: selectedIds.size > 0,
  };
}
```

### 3.2 Selection Triggers

**Desktop:**
- Click a checkbox column that appears on each item
- `Ctrl+Click` (or `Cmd+Click` on Mac) to toggle individual items
- `Shift+Click` to select a range from the last selected item to the clicked item
- `Ctrl+A` / `Cmd+A` to select all visible items (when not in an input field)

**Mobile:**
- Long-press on an item enters selection mode (shows checkboxes on all items)
- Tap to toggle selection
- "Select All" button in the floating action bar

**Keyboard (integrates with `KEYBOARD_SHORTCUTS.md`):**
- `Ctrl+A` — select all visible
- `Escape` — deselect all (if in selection mode)
- `x` with selection mode — complete all selected (instead of just focused item)

### 3.3 Selection UI on Items

When selection mode is active (at least one item selected), each item shows a checkbox on the left:

```typescript
// In TaskCard

{isSelectionMode && (
  <Checkbox
    checked={isSelected(task.id)}
    onCheckedChange={() => toggle(task.id)}
    className="mr-2"
    aria-label={`Select ${task.title}`}
  />
)}
```

Selected items get a highlight:

```typescript
<div
  className={cn(
    "rounded-lg border transition-all",
    isSelected(task.id) && "bg-primary/5 border-primary/30"
  )}
>
```

---

## 4. Floating Action Bar

When one or more items are selected, a floating bar appears at the bottom of the viewport:

```
┌──────────────────────────────────────────────────────────────┐
│  3 selected    [Complete] [Delete] [Move] [Context▼]  [×]   │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Component

```typescript
// src/components/shared/BulkActionBar.tsx

interface BulkActionBarProps {
  count: number;
  onComplete?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onChangeContext?: (contextId: string) => void;
  onChangeEnergy?: (level: string) => void;
  onSetDueDate?: (date: string) => void;
  onDeselectAll: () => void;
  entityType: "task" | "inbox";
}

export function BulkActionBar({
  count,
  onComplete,
  onDelete,
  onMove,
  onChangeContext,
  onChangeEnergy,
  onSetDueDate,
  onDeselectAll,
  entityType,
}: BulkActionBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border bg-background px-4 py-2 shadow-lg">
      <span className="text-sm font-medium mr-2">
        {count} selected
      </span>

      <Separator orientation="vertical" className="h-6" />

      {onComplete && (
        <Button size="sm" variant="outline" onClick={onComplete}>
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Complete
        </Button>
      )}

      {onMove && (
        <Button size="sm" variant="outline" onClick={onMove}>
          <FolderKanban className="h-4 w-4 mr-1" />
          Move
        </Button>
      )}

      {onChangeContext && (
        <ContextPickerDropdown onSelect={onChangeContext} />
      )}

      {onChangeEnergy && (
        <EnergyPickerDropdown onSelect={onChangeEnergy} />
      )}

      {onSetDueDate && (
        <DueDatePickerDropdown onSelect={onSetDueDate} />
      )}

      {onDelete && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          {showDeleteConfirm && (
            <DeleteConfirmDialog
              count={count}
              onConfirm={() => { onDelete(); setShowDeleteConfirm(false); }}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          )}
        </>
      )}

      <Separator orientation="vertical" className="h-6" />

      <Button size="sm" variant="ghost" onClick={onDeselectAll}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

### 4.2 Available Actions by Context

| Action | Do Now | Inbox | Project Tasks |
|--------|--------|-------|---------------|
| Complete | Yes | No | Yes |
| Delete | Yes | Yes | Yes |
| Move to Project | Yes | No | Yes |
| Change Context | Yes | No | Yes |
| Change Energy | Yes | No | Yes |
| Set Due Date | Yes | No | Yes |
| Convert to Tasks | No | Yes | No |
| Move to Someday/Maybe | Yes | No | Yes |

---

## 5. Bulk API

### 5.1 Task Bulk Endpoint

```
POST /api/tasks/bulk
```

```typescript
// Request body
interface BulkTaskRequest {
  taskIds: string[];
  action: "complete" | "delete" | "update";
  params?: {
    projectId?: string | null;
    contextId?: string | null;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH" | null;
    dueDate?: string | null;
    status?: string;
  };
}
```

```typescript
// src/app/api/tasks/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { bulkTaskSchema } from "@/lib/validations/bulk";
import { completeTask, updateTask } from "@/lib/services/task-service";

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const parsed = bulkTaskSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { taskIds, action, params } = parsed.data;

  // Verify all tasks belong to this user
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, userId },
    select: { id: true },
  });
  const validIds = new Set(tasks.map((t) => t.id));
  const invalid = taskIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return badRequest(`Tasks not found: ${invalid.join(", ")}`);
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  if (action === "complete") {
    // Complete tasks sequentially to respect cascade logic
    // (each completion may promote tasks that affect subsequent completions)
    for (const taskId of taskIds) {
      try {
        await completeTask(taskId, userId, {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
          message: `Bulk complete (${taskIds.length} tasks)`,
        });
        results.push({ id: taskId, success: true });
      } catch (error) {
        results.push({
          id: taskId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } else if (action === "delete") {
    // Delete in a single transaction
    await prisma.$transaction(async (tx) => {
      for (const taskId of taskIds) {
        await tx.task.delete({ where: { id: taskId } });
        results.push({ id: taskId, success: true });
      }
    });
  } else if (action === "update") {
    // Update all tasks with the same params
    for (const taskId of taskIds) {
      try {
        await updateTask(taskId, userId, params ?? {}, {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
          message: `Bulk update (${taskIds.length} tasks)`,
        });
        results.push({ id: taskId, success: true });
      } catch (error) {
        results.push({
          id: taskId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return NextResponse.json({
    totalRequested: taskIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
```

### 5.2 Inbox Bulk Endpoint

```
POST /api/inbox/bulk
```

For batch-processing inbox items into tasks:

```typescript
interface BulkInboxRequest {
  itemIds: string[];
  action: "delete" | "convert_to_tasks";
  params?: {
    projectId?: string;
    contextId?: string;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
  };
}
```

When `action` is `convert_to_tasks`:
1. For each inbox item, create a Task with `title = item.content`, `notes = item.notes`
2. Apply shared `params` (project, context, energy) to all created tasks
3. Mark each inbox item as `PROCESSED`

```typescript
// In the handler
if (action === "convert_to_tasks") {
  for (const itemId of itemIds) {
    const item = await prisma.inboxItem.findFirst({
      where: { id: itemId, userId, status: "UNPROCESSED" },
    });
    if (!item) continue;

    await createTask(userId, {
      title: item.content,
      notes: item.notes || undefined,
      projectId: params?.projectId,
      contextId: params?.contextId,
      energyLevel: params?.energyLevel,
    }, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
      message: "Bulk convert from inbox",
    });

    await processInboxItem(itemId, userId, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });
  }
}
```

---

## 6. Validation Schemas

```typescript
// src/lib/validations/bulk.ts

import { z } from "zod";

export const bulkTaskSchema = z.object({
  taskIds: z.array(z.string()).min(1).max(200),
  action: z.enum(["complete", "delete", "update"]),
  params: z.object({
    projectId: z.string().nullable().optional(),
    contextId: z.string().nullable().optional(),
    energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "DROPPED"]).optional(),
  }).optional(),
});

export const bulkInboxSchema = z.object({
  itemIds: z.array(z.string()).min(1).max(200),
  action: z.enum(["delete", "convert_to_tasks"]),
  params: z.object({
    projectId: z.string().optional(),
    contextId: z.string().optional(),
    energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  }).optional(),
});
```

---

## 7. Cascade Handling for Bulk Complete

Bulk completion is the most complex operation because each task completion can trigger cascades (promoting next actions, completing projects, updating goal progress). The cascade logic in `src/lib/cascade.ts` must run for each task.

**Sequential processing (not parallel):** Complete tasks one at a time because:
- Completing task A in a sequential project promotes task B as the next action
- If task B is also in the bulk selection, its completion must see the promoted `isNextAction` state
- Parallel processing could create race conditions in cascade logic

The response includes aggregate cascade results:

```typescript
interface BulkCompleteResponse {
  totalRequested: number;
  succeeded: number;
  failed: number;
  cascade: {
    promotedTasks: Array<{ id: string; title: string }>;
    completedProjects: Array<{ id: string; title: string }>;
    updatedGoals: Array<{ id: string; title: string; progress: number }>;
  };
  results: Array<{ id: string; success: boolean; error?: string }>;
}
```

---

## 8. UI Integration

### 8.1 Do Now Page

Add selection and bulk action bar to the Do Now page:

```typescript
// In DoNowContent

const {
  selectedIds,
  isSelected,
  toggle,
  selectRange,
  selectAll,
  deselectAll,
  selectionCount,
  isSelectionMode,
} = useSelection({ items: filteredTasks });

// ... in the render

{filteredTasks.map((task, index) => (
  <TaskCard
    key={task.id}
    task={task}
    onComplete={handleComplete}
    contexts={contexts}
    onUpdate={handleUpdateTask}
    onDelete={handleDeleteTask}
    // Selection props
    isSelectionMode={isSelectionMode}
    isSelected={isSelected(task.id)}
    onSelect={() => toggle(task.id)}
    onShiftSelect={() => {
      const lastSelected = [...selectedIds].pop();
      if (lastSelected) selectRange(lastSelected, task.id);
      else toggle(task.id);
    }}
  />
))}

{isSelectionMode && (
  <BulkActionBar
    count={selectionCount}
    onComplete={handleBulkComplete}
    onDelete={handleBulkDelete}
    onMove={() => setShowProjectPicker(true)}
    onChangeContext={handleBulkChangeContext}
    onChangeEnergy={handleBulkChangeEnergy}
    onSetDueDate={handleBulkSetDueDate}
    onDeselectAll={deselectAll}
    entityType="task"
  />
)}
```

### 8.2 Inbox Page

Similar integration but with inbox-specific actions:

```typescript
{isSelectionMode && (
  <BulkActionBar
    count={selectionCount}
    onDelete={handleBulkDelete}
    onConvertToTasks={() => setShowBulkConvert(true)}
    onDeselectAll={deselectAll}
    entityType="inbox"
  />
)}
```

The "Convert to Tasks" action opens a dialog where the user picks a shared project/context/energy for all selected items.

---

## 9. Implementation Phases

### Phase 1: Selection UI + Floating Bar

**Goal:** Multi-select tasks on Do Now with visual feedback and a floating bar (no actions yet).

**Code changes:**
- `src/lib/hooks/use-selection.ts` — Selection hook (new)
- `src/components/shared/BulkActionBar.tsx` — Floating action bar (new)
- `src/components/tasks/TaskCard.tsx` — Add checkbox, selection highlight, `onSelect`/`onShiftSelect` props
- `src/app/(dashboard)/do-now/page.tsx` — Integrate selection

**Files touched:** 4 (1 hook, 1 component, 1 component update, 1 page update)

### Phase 2: Complete + Delete Batch Actions

**Goal:** Bulk complete and delete tasks.

**Code changes:**
- `src/lib/validations/bulk.ts` — Zod schemas (new)
- `src/app/api/tasks/bulk/route.ts` — POST endpoint (new)
- `src/app/(dashboard)/do-now/page.tsx` — Wire up `handleBulkComplete` and `handleBulkDelete`
- Delete confirmation dialog component

**Files touched:** 4 (1 validation, 1 API route, 1 page update, 1 dialog component)

### Phase 3: Move + Change Batch Actions

**Goal:** Bulk move to project, change context, change energy, set due date.

**Code changes:**
- `src/components/shared/BulkActionBar.tsx` — Add context/energy/date picker dropdowns
- `src/app/(dashboard)/do-now/page.tsx` — Wire up remaining bulk actions
- Reuse existing `DeferDatePicker` for bulk due date

**Files touched:** 2-3

### Phase 4: Inbox Bulk Processing

**Goal:** Multi-select inbox items and batch-convert to tasks.

**Code changes:**
- `src/app/api/inbox/bulk/route.ts` — POST endpoint (new)
- `src/app/(dashboard)/inbox/page.tsx` — Integrate selection and bulk bar
- Bulk convert dialog (project/context/energy picker)

**Files touched:** 3

### Phase 5: Keyboard Selection

**Goal:** Keyboard-driven multi-select integrating with the shortcuts spec.

**Code changes:**
- `src/app/(dashboard)/do-now/page.tsx` — Register `Ctrl+A` (select all), `Escape` (deselect), modifier-aware `x` (bulk complete when selection active)
- `src/app/(dashboard)/inbox/page.tsx` — Same keyboard integration

**Files touched:** 2

---

## 10. Edge Cases

- **Cascade ordering for bulk complete** — Tasks are completed sequentially, not in parallel. If tasks A and B are in the same sequential project and A comes before B, completing A first promotes B, then B is completed. The order of `taskIds` in the request determines completion order. The API sorts by `sortOrder` within each project to ensure correct cascade sequencing.
- **Partial failure** — If completing task 5 of 10 fails (e.g., task was already completed by another tab), continue with the remaining tasks. Return per-task success/failure in the response.
- **Large selections** — Cap at 200 items per bulk request. For larger needs, the client batches into multiple requests.
- **Stale selection** — If another tab/user modifies a selected task between selection and action, the action may fail for that task. The response reports per-task results.
- **Selection persistence during scroll** — Selections are stored in a `Set<string>` in React state. Virtualized lists (if implemented later) must preserve selection state for items scrolled off-screen.
- **Undo** — This spec does not implement undo. Bulk delete shows a confirmation dialog. Bulk complete shows cascade results. A future undo spec can use `TaskSnapshot` (with `SnapshotReason.BULK_OPERATION`) to enable reversal.
- **Team tasks** — Bulk actions respect the same permission model as individual actions. A user can only bulk-modify tasks they own or have permission to edit.
- **Empty selection** — The floating action bar only appears when `selectionCount > 0`. If all selected items are removed (e.g., another user deletes them), the bar disappears.

---

## 11. What This Spec Does Not Cover

- **Undo/redo** — A general undo system is a separate spec. This spec creates `BULK_OPERATION` snapshots to enable future undo integration but does not implement the reversal logic.
- **Drag-and-drop reordering** — Multi-select + drag to reorder is a different UX pattern. This spec covers action-based batch operations only.
- **Bulk edit inline** — No inline editing of multiple tasks simultaneously (e.g., editing all titles at once). Bulk operations apply the same change to all selected items.
- **Project-level bulk operations** — Bulk-completing or archiving entire projects. This spec covers task-level operations only.
- **Saved selections** — No ability to save a selection as a named group for reuse.
- **MCP bulk tools** — No `tandem_task_bulk_complete` MCP tool. Individual MCP operations are sufficient for AI workflows.

---

## 12. Future Considerations

- **Undo integration** — Create a `TaskSnapshot` (with `SnapshotReason.BULK_OPERATION`) for all affected tasks before executing the bulk action. Store the snapshot batch ID on the response so an undo endpoint can revert all changes at once.
- **Progress indicator for large batches** — For bulk operations affecting 50+ items, show a progress bar in the floating action bar instead of immediately closing it.
- **Bulk operations via MCP** — Add `tandem_task_bulk_update` tool for AI-assisted batch workflows (e.g., "mark all @Office tasks as WAITING").
- **Smart selection** — "Select all overdue tasks", "Select all tasks in project X". Preset selection filters integrated into the action bar.
- **Export selected** — "Export these 15 selected tasks as CSV" — integrates with the Import/Export spec.
```

---
