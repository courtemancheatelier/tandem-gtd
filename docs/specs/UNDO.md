# Undo System — Toast-Based Reversal for Destructive Actions

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### What Exists

Tandem has a `CascadeToast` component (`src/components/history/CascadeToast.tsx`) that shows completion feedback with cascade effects (promoted tasks, completed projects, updated goals). It auto-dismisses after 5 seconds and pauses on hover. The app also uses the shadcn/ui toast system (`src/components/ui/use-toast.ts`, Radix-based) for general notifications throughout — inbox capture, task creation, settings changes, etc.

Additionally, the event history system (`TaskEvent`, `ProjectEvent`, `InboxEvent`) records every state change with `{ field: { old, new } }` diffs and the `TaskSnapshot` model captures full task state at key moments (completion, weekly review, bulk operations).

### The Gap

All destructive actions are immediate and irreversible from the user's perspective:

1. **Complete a task** — the cascade engine fires (next action promotion, project completion check, goal progress update). There is no way to undo. The user must manually reopen the task and reverse every cascade effect.
2. **Delete a task** — hard-deleted via `prisma.task.delete()`. Gone permanently. No recycle bin.
3. **Delete a project** — hard-deleted with cascade to tasks. Unrecoverable.
4. **Move a task to a different project** — the old project assignment is lost. The user must remember and manually re-assign.
5. **Process an inbox item** — marked as PROCESSED. The item disappears from the inbox with no way to "unprocess" it.
6. **Bulk operations** — completing or moving multiple tasks at once with no batch undo.

Users moving quickly through their GTD workflow — especially during inbox processing and weekly review — will inevitably fat-finger an action. Without undo, the cost of a mistake is disproportionately high.

### What Done Looks Like

After any destructive action, a toast appears at the bottom of the screen with an "Undo" button. Clicking it reverses the action, including any cascade side effects. The toast auto-dismisses after 5 seconds; once dismissed, the action becomes permanent.

---

## 2. Design Decisions

### Approach: Immediate Execute + Reverse

Two approaches were evaluated:

| Approach | Pros | Cons |
|---|---|---|
| **Soft delete / delayed commit** — queue the action, only execute after 5s timeout | Simple conceptually; no reverse logic | Creates phantom state: task looks gone but isn't. Cascade can't fire immediately. Other users/MCP might see stale data. Offline-unfriendly. |
| **Immediate execute + reverse** — execute immediately, store previous state, restore on undo | Honest state. Cascade fires immediately. No phantom data. | Must reverse cascade effects. More complex implementation. |

**Decision: Immediate execute + reverse.** The cascade engine (`src/lib/cascade.ts`) must fire immediately for project completion checks and goal progress to stay accurate. A delayed approach would break the integrity of the GTD system for any user with MCP tools or multiple browser tabs.

### Toast Library: Existing shadcn/ui Toast

The app currently uses the shadcn/ui Radix-based toast system (`src/components/ui/use-toast.ts`). Rather than adding Sonner (a second toast library), extend the existing system. The `CascadeToast` component already demonstrates the pattern: custom toast with action buttons, auto-dismiss with pause-on-hover, and animation. The undo toast follows the same pattern.

If in the future the team wants to migrate to Sonner for its richer API, that can be done as a separate effort. For now, one toast system.

### Undo Scope: Client-Side, Ephemeral, One Level

- **Ephemeral** — undo state is lost on page navigation or refresh. This is intentional: the 5-second window is the only undo opportunity.
- **One level** — no redo. No multi-step undo history. This matches user expectations from mobile/web apps.
- **Client-side only** — no `UndoLog` database table in Phase 1. The undo reverse action is a plain API call (e.g., PATCH to reopen a task). Phase 2 adds server-side soft-delete for data recovery.

---

## 3. Data Model Changes

### Phase 1: No Schema Changes

Undo is entirely client-side. The reverse action uses existing API endpoints:
- Reopen task: `PATCH /api/tasks/:id` with `{ status: "NOT_STARTED" }`
- Restore inbox item: `PATCH /api/inbox/:id` with `{ status: "UNPROCESSED" }`
- Move task back: `PATCH /api/tasks/:id` with `{ projectId: "<previous>" }`

### Phase 2: Soft-Delete Support

Add soft-delete to `Task` and `Project` for recoverable deletion:

```prisma
// In model Task (schema.prisma)
deletedAt   DateTime?   // Null = not deleted. Set = soft-deleted.
deletedBy   String?     // Actor ID who deleted it

// In model Project (schema.prisma)
deletedAt   DateTime?
deletedBy   String?
```

Add index:

```prisma
@@index([deletedAt])  // on both Task and Project
```

All existing queries must add `deletedAt: null` to their where clause (or use a Prisma middleware for global filtering). A nightly cleanup job hard-deletes records where `deletedAt < 30 days ago`.

---

## 4. Implementation

### 4.1 UndoContext — React Context Provider

A React context that holds a stack of undoable operations. Any component that performs a destructive action pushes an undo entry; the toast UI consumes from it.

```typescript
// src/contexts/UndoContext.tsx

interface UndoOperation {
  id: string;                          // Unique ID for this undo entry
  description: string;                 // Toast text: "Task completed", "3 tasks deleted"
  reverseAction: () => Promise<void>; // The function that reverses the action
  expiresAt: number;                   // Date.now() + 5000
  cascadeReversal?: CascadeReversal;  // Optional: cascade effects to reverse
}

interface CascadeReversal {
  demoteTasks: string[];       // Task IDs to set isNextAction = false
  reopenProjects: string[];    // Project IDs to set status = ACTIVE
  revertGoals: Array<{ id: string; previousProgress: number; previousStatus: string }>;
}

interface UndoContextValue {
  push: (op: Omit<UndoOperation, "id" | "expiresAt">) => string;
  execute: (id: string) => Promise<void>;  // Execute the undo
  dismiss: (id: string) => void;           // Dismiss without undoing
  current: UndoOperation | null;           // Most recent undoable operation
}
```

The context provider wraps the app layout (inside `src/app/(dashboard)/layout.tsx`). It manages a single active undo at a time (LIFO — new undo replaces old one, since the old one's toast has been replaced visually).

```typescript
// src/contexts/UndoContext.tsx

"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

const UndoContext = createContext<UndoContextValue | null>(null);

let undoIdCounter = 0;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<UndoOperation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((id: string) => {
    setCurrent((prev) => (prev?.id === id ? null : prev));
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const push = useCallback(
    (op: Omit<UndoOperation, "id" | "expiresAt">) => {
      // Clear any existing timer
      if (timerRef.current) clearTimeout(timerRef.current);

      const id = String(++undoIdCounter);
      const expiresAt = Date.now() + 5000;
      const operation: UndoOperation = { ...op, id, expiresAt };

      setCurrent(operation);

      // Auto-dismiss after 5 seconds
      timerRef.current = setTimeout(() => {
        setCurrent((prev) => (prev?.id === id ? null : prev));
      }, 5000);

      return id;
    },
    []
  );

  const execute = useCallback(
    async (id: string) => {
      const op = current;
      if (!op || op.id !== id) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrent(null);

      try {
        await op.reverseAction();
      } catch (error) {
        console.error("Undo failed:", error);
      }
    },
    [current]
  );

  return (
    <UndoContext.Provider value={{ push, execute, dismiss, current }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}
```

### 4.2 UndoToast Component

```typescript
// src/components/undo/UndoToast.tsx

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle, Undo2, X } from "lucide-react";
import { useUndo } from "@/contexts/UndoContext";

export function UndoToast() {
  const { current, execute, dismiss } = useUndo();
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

  const startProgressBar = useCallback(() => {
    if (!current) return;
    const totalMs = 5000;
    const stepMs = 50;
    const decrement = (stepMs / totalMs) * 100;

    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setProgress((prev) => Math.max(0, prev - decrement));
    }, stepMs);
  }, [current]);

  useEffect(() => {
    if (current) {
      setProgress(100);
      setExiting(false);
      startProgressBar();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [current, startProgressBar]);

  const handleUndo = async () => {
    if (!current) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    await execute(current.id);
  };

  const handleDismiss = () => {
    if (!current) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setExiting(true);
    setTimeout(() => dismiss(current.id), 200);
  };

  if (!current) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50",
        "pointer-events-auto flex w-full max-w-sm items-center gap-3",
        "overflow-hidden rounded-lg border bg-background p-4 shadow-lg transition-all",
        exiting
          ? "animate-out fade-out-80 slide-out-to-bottom-full"
          : "animate-in slide-in-from-bottom-full"
      )}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10">
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{current.description}</p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleUndo}>
        <Undo2 className="h-3.5 w-3.5" />
        Undo
      </Button>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

Visual design:
- Positioned at bottom-center, above the mobile bottom tab bar (using `bottom-20 md:bottom-4`)
- Left: green checkmark icon + description text
- Right: "Undo" button (outline variant, small)
- Auto-dismiss timer with progress bar underneath
- Pause timer on hover (same pattern as `CascadeToast`)
- Keyboard accessible: pressing `Ctrl+Z` / `Cmd+Z` within the 5s window triggers undo

### 4.3 Task Completion Undo

The most complex case because of the cascade engine.

**Current flow** (in `src/lib/services/task-service.ts` `completeTask()`):
1. Write COMPLETED event
2. `onTaskComplete()` cascade runs — marks task completed, promotes successor tasks, checks project completion, updates goal progress
3. Write CASCADE events for promoted tasks and completed projects

**Undo flow:**
1. User clicks "Undo" within 5 seconds
2. Client calls `POST /api/tasks/:id/undo-complete` (new endpoint)
3. Server:
   a. Sets task status back to its previous status (from the TaskEvent changes: `changes.status.old`)
   b. Sets `isNextAction` back to `true` (or whatever it was — stored in the event)
   c. Sets `completedAt` back to `null`
   d. **Reverses cascade:** for each `promotedTask` in the cascade result, set `isNextAction = false`. For each `completedProject`, set `status = ACTIVE, completedAt = null`. For each `updatedGoal`, revert progress to previous value.
   e. Writes a REOPENED event with `source: "MANUAL"` and a message indicating undo.

**Key insight:** The `CascadeResult` returned from `completeTask()` already contains the exact data needed for reversal: `promotedTasks`, `completedProjects`, `updatedGoals`. The client stores this in the `UndoOperation.cascadeReversal` field.

```typescript
// In the component that completes a task:
const { task, cascade } = await completeTaskAPI(taskId);

undoContext.push({
  description: `Completed "${task.title}"`,
  reverseAction: async () => {
    await fetch(`/api/tasks/${taskId}/undo-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previousStatus: "NOT_STARTED",
        cascade: {
          demoteTasks: cascade.promotedTasks.map(t => t.id),
          reopenProjects: cascade.completedProjects.map(p => p.id),
          revertGoals: cascade.updatedGoals.map(g => ({
            id: g.id,
            previousProgress: g.previousProgress,
            previousStatus: g.previousStatus,
          })),
        },
      }),
    });
  },
});
```

### 4.4 Undo-Complete API Endpoint

```typescript
// src/app/api/tasks/[id]/undo-complete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { writeTaskEvent } from "@/lib/history/event-writer";
import { z } from "zod";

const undoCompleteSchema = z.object({
  previousStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING"]),
  cascade: z.object({
    demoteTasks: z.array(z.string()).default([]),
    reopenProjects: z.array(z.string()).default([]),
    revertGoals: z.array(z.object({
      id: z.string(),
      previousProgress: z.number(),
      previousStatus: z.string(),
    })).default([]),
  }).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = undoCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { previousStatus, cascade } = parsed.data;

  const task = await prisma.task.findFirst({
    where: { id: params.id, userId, status: "COMPLETED" },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Task not found or not in COMPLETED status" },
      { status: 404 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // 1. Reopen the task
    await tx.task.update({
      where: { id: params.id },
      data: {
        status: previousStatus,
        isNextAction: true,
        completedAt: null,
      },
    });

    // 2. Demote tasks that were promoted by cascade
    if (cascade?.demoteTasks?.length) {
      await tx.task.updateMany({
        where: { id: { in: cascade.demoteTasks }, userId },
        data: { isNextAction: false },
      });
    }

    // 3. Reopen projects that were auto-completed
    if (cascade?.reopenProjects?.length) {
      await tx.project.updateMany({
        where: { id: { in: cascade.reopenProjects }, userId },
        data: { status: "ACTIVE", completedAt: null },
      });
    }

    // 4. Revert goal progress
    if (cascade?.revertGoals?.length) {
      for (const goal of cascade.revertGoals) {
        await tx.goal.update({
          where: { id: goal.id },
          data: {
            progress: goal.previousProgress,
            status: goal.previousStatus as "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "DEFERRED",
          },
        });
      }
    }

    // 5. Write REOPENED event
    await writeTaskEvent(tx, params.id, "REOPENED", {
      status: { old: "COMPLETED", new: previousStatus },
      isNextAction: { old: false, new: true },
      completedAt: { old: task.completedAt?.toISOString() ?? null, new: null },
    }, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
      message: "Undo task completion",
    });
  });

  return NextResponse.json({ success: true });
}
```

### 4.5 Storing Previous Goal State in CascadeResult

The current `CascadeResult` includes `updatedGoals` with the *new* progress, but not the *old* progress. To enable undo, extend `CascadeResult`:

```typescript
// In src/lib/cascade.ts
export interface CascadeResult {
  promotedTasks: Array<{ id: string; title: string }>;
  completedProjects: Array<{ id: string; title: string }>;
  updatedGoals: Array<{
    id: string;
    title: string;
    progress: number;
    previousProgress: number;    // NEW
    previousStatus: string;      // NEW
  }>;
  completedMilestones: Array<{ id: string; title: string }>;
  updatedRollups: Array<{ id: string; title: string; progress: number }>;
}
```

In `checkProjectCompletion()` (~line 303 of `src/lib/cascade.ts`), capture the old values before updating:

```typescript
// Before the goal update, fetch current state
const currentGoal = await prisma.goal.findUnique({
  where: { id: project.goalId },
  select: { progress: true, status: true },
});

const oldProgress = currentGoal?.progress ?? 0;
const oldStatus = currentGoal?.status ?? "NOT_STARTED";

const goal = await prisma.goal.update({
  where: { id: project.goalId },
  data: {
    progress,
    ...(progress === 100 ? { status: "ACHIEVED" } : {}),
  },
});

result.updatedGoals.push({
  id: goal.id,
  title: goal.title,
  progress,
  previousProgress: oldProgress,
  previousStatus: oldStatus,
});
```

### 4.6 Other Undoable Actions

**Task deletion (Phase 2 with soft-delete):**
```typescript
// Instead of prisma.task.delete(), set deletedAt
await prisma.task.update({
  where: { id: taskId },
  data: { deletedAt: new Date(), deletedBy: userId },
});

undoContext.push({
  description: `Deleted "${task.title}"`,
  reverseAction: async () => {
    await fetch(`/api/tasks/${taskId}/restore`, { method: "POST" });
  },
});
```

**Move task to different project:**
```typescript
const previousProjectId = task.projectId;
await updateTaskAPI(taskId, { projectId: newProjectId });

undoContext.push({
  description: `Moved "${task.title}" to ${newProject.title}`,
  reverseAction: async () => {
    await updateTaskAPI(taskId, { projectId: previousProjectId });
  },
});
```

**Inbox processing undo:**
```typescript
undoContext.push({
  description: `Processed "${inboxItem.content.slice(0, 40)}..."`,
  reverseAction: async () => {
    await fetch(`/api/inbox/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "UNPROCESSED" }),
    });
    if (createdTaskId) {
      await fetch(`/api/tasks/${createdTaskId}`, { method: "DELETE" });
    }
  },
});
```

**Bulk operations:**
```typescript
const undoPayloads = results.map(r => ({
  taskId: r.task.id,
  previousStatus: "NOT_STARTED",
  cascade: r.cascade,
}));

undoContext.push({
  description: `Completed ${results.length} tasks`,
  reverseAction: async () => {
    await fetch("/api/tasks/bulk-undo-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: undoPayloads }),
    });
  },
});
```

---

## 5. Edge Cases

### Race Conditions
- User completes task A, which promotes task B. Another user (or MCP) modifies task B before undo fires. The undo should still attempt to demote task B, but if B has been further modified (e.g., also completed), the demote is a no-op. The API endpoint should handle gracefully — skip items that are no longer in the expected state.

### Page Navigation During Undo Window
- Undo state is lost. This is by design. The 5-second window is the only undo opportunity. An improvement for Phase 4 would be to persist the undo stack in sessionStorage across navigations within the same tab.

### Multiple Rapid Actions
- Each new action replaces the previous undo opportunity. Only the most recent action can be undone. This matches how iOS/Android handle inline undo in list views.

### Cascade Chains
- Task A completion triggers cascade that completes Project X, which updates Goal Y. Undoing task A must reverse the entire chain. The `CascadeResult` already captures this full chain, so the undo endpoint reverses it in the correct order (goals first, then projects, then task promotions, then the original task).

### Task Completion with Recurring Recycling
- If the task has `recurringTemplateId` and completion triggers recycling (creates next occurrence), undo should also delete the recycled task. Add `recycledTasks` IDs to the cascade reversal payload.

### Undo After Toast Dismissed
- Once the toast auto-dismisses (after 5 seconds), the undo is no longer available. The timer runs client-side; the server does not track undo windows.

### Offline / Network Failure During Undo
- If the undo API call fails, show an error toast: "Undo failed. You can manually reopen the task." The original action has already been committed to the database.

---

## 6. Implementation Phases

### Phase 1: Undo Infrastructure + Task Complete Undo

**Goal:** Toast-based undo for the most common and most dangerous action.

**New files:**
- `src/contexts/UndoContext.tsx` — React context provider with undo stack
- `src/components/undo/UndoToast.tsx` — Toast UI component with undo button + progress bar
- `src/app/api/tasks/[id]/undo-complete/route.ts` — Server-side reversal endpoint
- `src/lib/validations/undo.ts` — Zod schemas for undo payloads

**Modified files:**
- `src/lib/cascade.ts` — Add `previousProgress` and `previousStatus` to `CascadeResult.updatedGoals`
- `src/app/(dashboard)/layout.tsx` — Wrap children with `<UndoProvider>`
- `src/app/(dashboard)/do-now/page.tsx` — Use `UndoContext` after task completion
- `src/components/history/CascadeToast.tsx` — Integrate undo button alongside cascade info
- Task completion handlers across the app (do-now page, project detail page, etc.)

### Phase 2: Task Delete + Project Delete Undo (Soft-Delete)

**Goal:** Recoverable deletion with soft-delete.

**Schema changes:**
- Add `deletedAt DateTime?` and `deletedBy String?` to `Task` and `Project` models
- Add `@@index([deletedAt])` to both
- Migration: `npx prisma migrate dev --name add-soft-delete`

**New files:**
- `src/app/api/tasks/[id]/restore/route.ts` — Restore soft-deleted task
- `src/app/api/projects/[id]/restore/route.ts` — Restore soft-deleted project + tasks

**Modified files:**
- All task/project query endpoints — add `deletedAt: null` filter
- Task/project delete endpoints — change from hard-delete to soft-delete
- `src/app/api/cron/cleanup/route.ts` (new) — Nightly job to hard-delete records >30 days old

### Phase 3: Move Task + Inbox Processing + Bulk Undo

**Goal:** Cover remaining undoable actions.

**Modified files:**
- `src/app/(dashboard)/projects/[id]/page.tsx` — Undo task move
- `src/components/inbox/ProcessingWizard.tsx` — Undo inbox processing
- `src/app/api/tasks/bulk-undo-complete/route.ts` (new) — Batch reversal endpoint
- Any bulk operation UI components

### Phase 4: Ctrl+Z Keyboard Shortcut + SessionStorage Persistence

**Goal:** Polish and power-user features.

**Modified files:**
- `src/contexts/UndoContext.tsx` — Add keyboard listener for Cmd+Z / Ctrl+Z
- `src/contexts/UndoContext.tsx` — Persist undo stack to sessionStorage for cross-navigation undo within same tab

---

## 7. Key Files Reference

| File | What's There | What Changes |
|---|---|---|
| `src/lib/cascade.ts` | `CascadeResult` (line 4-10), `onTaskComplete()` (line 66), `checkProjectCompletion()` (line 267) | Add `previousProgress`/`previousStatus` to updatedGoals |
| `src/lib/services/task-service.ts` | `completeTask()` (line 169-256) | No changes — callers use the returned CascadeResult for undo |
| `src/components/history/CascadeToast.tsx` | Completion feedback toast with cascade badges | Add undo button integration |
| `src/components/ui/use-toast.ts` | shadcn/ui toast system | No changes — UndoToast is separate component |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout wrapper | Add UndoProvider context |
| `src/app/(dashboard)/do-now/page.tsx` | Do Now page with task completion | Add undo push after completion |
| `prisma/schema.prisma` | Task, Project models | Phase 2: add deletedAt, deletedBy |

---

## 8. What This Spec Does Not Cover

- **Multi-level undo / undo history** — intentionally limited to one level. A full undo/redo system would require event sourcing replay, which is architecturally different.
- **Server-side undo log** — no persistent undo table. The event history (`TaskEvent`, etc.) provides an audit trail, but not automatic rollback.
- **Undo for settings changes** — admin/user settings changes are not covered.
- **Undo for wiki edits** — wiki already has version history; undo there is a "revert to previous version" operation, which is a different UX.
- **Collaborative undo** — undoing another user's action on a shared project. Out of scope; the undo only applies to the acting user's own recent action.
- **Redo** — no redo support. Once undone, the user must re-perform the action manually.
