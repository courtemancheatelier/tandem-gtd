# Tandem Task History System

## The Idea

Every task, project, and inbox item in Tandem gets a full change history — like git for your GTD data. Every edit, status change, delegation, completion, and cascade event is recorded as an immutable event. You can see exactly what changed, when, why, and by whom.

This isn't just an audit log. It's a first-class feature that makes the system more trustworthy, more collaborative, and more useful for reflection.

---

## Why This Matters for GTD

**Trust requires transparency.** GTD only works when you trust your system completely. History gives you confidence that nothing fell through the cracks — you can always trace how a task got to its current state.

**Weekly Review becomes powerful.** Instead of relying on memory, the review can show you: "Here's everything that changed this week across all your projects." Tasks completed, tasks added, projects that went stale, items that got re-prioritized.

**Collaboration needs accountability.** When you and your brother share projects, you need to see who changed what. "Jason moved this to @errands on Tuesday" vs "this task mysteriously changed contexts."

**The cascade engine needs a trail.** When completing one task automatically unblocks three others across two projects, that chain of events should be visible and traceable. Otherwise the cascade feels like magic (at first) and then like chaos (when something goes wrong).

---

## Architecture: Event Sourcing Lite

Full event sourcing (where the current state is derived by replaying all events) is powerful but heavy. Instead, Tandem uses a hybrid approach:

- **Current state lives in the normal tables** (Task, Project, InboxItem, etc.) — fast reads, simple queries
- **Every mutation also writes an event to the history table** — immutable append-only log
- **Snapshots are stored periodically** — so you can reconstruct any point in time without replaying thousands of events

This gives you git-like history without the complexity of a full event-sourced system.

```
┌─────────────────────────┐
│   Normal Tables          │  ← Current state (fast reads)
│   Task, Project, etc.    │
└─────────┬───────────────┘
          │ Every mutation also writes ↓
┌─────────▼───────────────┐
│   TaskEvent (append-only)│  ← Full history
│   ProjectEvent           │
│   InboxEvent             │
└─────────┬───────────────┘
          │ Periodic snapshots ↓
┌─────────▼───────────────┐
│   TaskSnapshot           │  ← Point-in-time reconstruction
│   ProjectSnapshot        │
└──────────────────────────┘
```

---

## Data Model

### Core Event Table

```prisma
// Every change to a task produces one TaskEvent record.
// Events are immutable — never updated or deleted.

model TaskEvent {
  id          String   @id @default(cuid())
  taskId      String
  task        Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)

  // What happened
  eventType   TaskEventType
  
  // Who did it
  actorType   ActorType     @default(USER)
  actorId     String?       // userId, or null for system/cascade
  actor       User?         @relation(fields: [actorId], references: [id])
  
  // What changed (stored as JSON diff)
  changes     Json          // { field: { old: value, new: value } }
  
  // Context
  message     String?       // Optional commit-message-style note
  source      EventSource   @default(MANUAL)
  triggeredBy String?       // ID of the event that caused this (cascade chain)
  
  // Metadata
  createdAt   DateTime      @default(now())
  
  // For efficient queries
  @@index([taskId, createdAt])
  @@index([actorId, createdAt])
  @@index([eventType, createdAt])
  @@index([triggeredBy])
}

enum TaskEventType {
  CREATED
  UPDATED            // Field changes (title, notes, context, energy, time, etc.)
  STATUS_CHANGED     // available → completed, deferred, waiting, etc.
  COMPLETED
  REOPENED
  MOVED_TO_PROJECT   // Assigned or reassigned to a project
  REMOVED_FROM_PROJECT
  DELEGATED          // Assigned to another user
  DELEGATION_ACCEPTED
  DELEGATION_DECLINED
  DEFERRED           // Tickler date set or changed
  ACTIVATED          // Came off tickler / became available
  CONTEXT_CHANGED
  DEPENDENCY_ADDED
  DEPENDENCY_REMOVED
  UNBLOCKED          // Dependency resolved (cascade event)
  PROMOTED           // Became next action via cascade
  ARCHIVED
  RESTORED           // Un-archived
  COMMENTED          // User added a note/comment
}

enum ActorType {
  USER       // Human user action
  SYSTEM     // Cascade engine, scheduler, automation
  AI         // AI assistant action (embedded or MCP)
}

enum EventSource {
  MANUAL     // User clicked/typed in UI
  MCP        // Via MCP tool call from Claude
  AI_EMBED   // Via embedded AI assistant
  CASCADE    // Next-action cascade engine
  SCHEDULER  // Tickler/defer date activation
  API        // External API call
  IMPORT     // Data import
}
```

### Project Events (Same Pattern)

```prisma
model ProjectEvent {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  eventType   ProjectEventType
  actorType   ActorType     @default(USER)
  actorId     String?
  actor       User?         @relation(fields: [actorId], references: [id])
  changes     Json
  message     String?
  source      EventSource   @default(MANUAL)
  triggeredBy String?
  createdAt   DateTime      @default(now())
  
  @@index([projectId, createdAt])
  @@index([actorId, createdAt])
}

enum ProjectEventType {
  CREATED
  UPDATED
  COMPLETED           // All tasks done, outcome achieved
  REACTIVATED
  TASK_ADDED
  TASK_REMOVED
  TASK_REORDERED      // Sequence changed
  NEXT_ACTION_ADVANCED // Cascade: new task became the next action
  STALLED             // No activity for N days (system-detected)
  SHARED              // Shared with another user
  UNSHARED
  ARCHIVED
  RESTORED
}
```

### Inbox Events

```prisma
model InboxEvent {
  id          String   @id @default(cuid())
  inboxItemId String
  inboxItem   InboxItem @relation(fields: [inboxItemId], references: [id], onDelete: Cascade)
  
  eventType   InboxEventType
  actorType   ActorType     @default(USER)
  actorId     String?
  actor       User?         @relation(fields: [actorId], references: [id])
  changes     Json
  message     String?
  source      EventSource   @default(MANUAL)
  createdAt   DateTime      @default(now())
  
  @@index([inboxItemId, createdAt])
}

enum InboxEventType {
  CAPTURED            // Item entered inbox
  PROCESSED           // Clarified and moved to task/project/reference/trash
  MERGED              // Combined with another inbox item
}
```

### Snapshots (Point-in-Time Reconstruction)

```prisma
// Periodic full snapshots of task state.
// Created: on completion, weekly (during review), and before bulk operations.

model TaskSnapshot {
  id         String   @id @default(cuid())
  taskId     String
  task       Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  // Full state at this point in time
  state      Json     // Complete task object as JSON
  
  // What triggered the snapshot
  reason     SnapshotReason
  eventId    String?  // The event that triggered this snapshot
  
  createdAt  DateTime @default(now())
  
  @@index([taskId, createdAt])
}

enum SnapshotReason {
  COMPLETION       // Task was completed
  WEEKLY_REVIEW    // Snapshot during weekly review
  BULK_OPERATION   // Before a bulk edit
  MANUAL           // User requested
  REVERT_POINT     // Created before a revert operation
}
```

---

## The Changes JSON Format

The `changes` field stores a structured diff of what changed. This is the heart of the history — it lets you reconstruct diffs, show human-readable changelogs, and power the AI summary.

```typescript
// Example: User changed context and energy level
{
  "context": { 
    "old": "@office", 
    "new": "@home" 
  },
  "energyLevel": { 
    "old": "high", 
    "new": "low" 
  }
}

// Example: Task created (all fields are "new")
{
  "title": { "old": null, "new": "Call dentist to schedule cleaning" },
  "context": { "old": null, "new": "@phone" },
  "energyLevel": { "old": null, "new": "low" },
  "timeEstimate": { "old": null, "new": 5 },
  "projectId": { "old": null, "new": "proj_health_2025" }
}

// Example: Cascade engine promoted a task
{
  "status": { 
    "old": "blocked", 
    "new": "available" 
  },
  "_cascade": {
    "reason": "dependency_resolved",
    "resolvedDependency": "task_abc123",
    "resolvedDependencyTitle": "Get budget approval from finance",
    "chainOrigin": "task_xyz789"  // The task that was completed to start the chain
  }
}

// Example: Delegation
{
  "assigneeId": {
    "old": "user_jason",
    "new": "user_brother"
  },
  "status": {
    "old": "available",
    "new": "waiting"
  }
}
```

---

## How Events Get Created

Events are created via a middleware layer that wraps all mutations. You never write directly to Task — you go through the service layer, which handles both the mutation and the event.

```typescript
// src/lib/services/task-service.ts

import { prisma } from "@/lib/prisma";
import { diff } from "@/lib/history/diff";

export async function updateTask(
  taskId: string,
  updates: Partial<TaskUpdateInput>,
  actor: { id: string; type: ActorType },
  options?: { 
    message?: string; 
    source?: EventSource;
    triggeredBy?: string;  // Parent event ID for cascade chains
  }
) {
  return prisma.$transaction(async (tx) => {
    // 1. Get current state
    const current = await tx.task.findUniqueOrThrow({
      where: { id: taskId }
    });
    
    // 2. Apply update
    const updated = await tx.task.update({
      where: { id: taskId },
      data: updates,
    });
    
    // 3. Compute diff
    const changes = diff(current, updated);
    
    // 4. Determine event type
    const eventType = inferEventType(changes, updates);
    
    // 5. Write event (if something actually changed)
    if (Object.keys(changes).length > 0) {
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType,
          actorType: actor.type,
          actorId: actor.id,
          changes,
          message: options?.message,
          source: options?.source ?? "MANUAL",
          triggeredBy: options?.triggeredBy,
        }
      });
    }
    
    return updated;
  });
}

// The cascade engine uses the same function with ActorType.SYSTEM
export async function cascadePromoteTask(
  taskId: string, 
  triggeringEventId: string
) {
  return updateTask(
    taskId,
    { status: "available" },
    { id: null, type: "SYSTEM" },
    { 
      source: "CASCADE",
      triggeredBy: triggeringEventId,
      message: "Promoted to available — dependency resolved"
    }
  );
}
```

---

## Cascade Chain Tracking

This is where the git-like history really shines. When you complete a task and the cascade engine fires, every downstream effect is linked back to the original event.

```
User completes "Get budget approval"
  └─ TaskEvent #1: COMPLETED (actor: USER, source: MANUAL)
     │
     ├─ TaskEvent #2: UNBLOCKED "Send PO to vendor" 
     │    (actor: SYSTEM, source: CASCADE, triggeredBy: #1)
     │    └─ TaskEvent #3: PROMOTED to next action
     │         (actor: SYSTEM, source: CASCADE, triggeredBy: #2)
     │
     └─ TaskEvent #4: UNBLOCKED "Schedule kickoff meeting"
          (actor: SYSTEM, source: CASCADE, triggeredBy: #1)
          └─ ProjectEvent #5: NEXT_ACTION_ADVANCED on "Vendor Onboarding"
               (actor: SYSTEM, source: CASCADE, triggeredBy: #4)
```

You can traverse `triggeredBy` to reconstruct the entire cascade tree from any event.

---

## Querying History

### API Endpoints

```typescript
// GET /api/tasks/:id/history
// Returns chronological event log for a task
taskHistory(taskId: string, options?: {
  limit?: number;
  before?: Date;
  after?: Date;
  eventTypes?: TaskEventType[];
  actorId?: string;
}) => Promise<TaskEvent[]>

// GET /api/tasks/:id/history/diff/:eventId
// Returns the specific changes for one event, formatted for display
taskEventDiff(taskId: string, eventId: string) => Promise<{
  event: TaskEvent;
  changes: FormattedDiff[];  // Human-readable change descriptions
  cascadeTree?: CascadeNode; // If this event triggered cascades
}>

// GET /api/tasks/:id/history/at/:timestamp
// Reconstructs task state at a specific point in time
taskStateAt(taskId: string, timestamp: Date) => Promise<TaskState>
// Uses nearest snapshot + replays events forward

// GET /api/tasks/:id/history/revert/:eventId
// Preview what reverting to a previous state would change
taskRevertPreview(taskId: string, eventId: string) => Promise<{
  currentState: TaskState;
  revertedState: TaskState;
  diff: FormattedDiff[];
}>

// POST /api/tasks/:id/history/revert/:eventId
// Actually revert (creates new events, doesn't delete history)
taskRevert(taskId: string, eventId: string) => Promise<{
  task: Task;
  revertEvent: TaskEvent;  // New UPDATED event with message "Reverted to state from {date}"
}>

// GET /api/history/feed
// Activity feed across all tasks/projects for a user
activityFeed(userId: string, options?: {
  limit?: number;
  before?: Date;
  after?: Date;
  entityTypes?: ("task" | "project" | "inbox")[];
  sources?: EventSource[];
}) => Promise<FeedItem[]>

// GET /api/history/weekly-summary
// Aggregated summary for weekly review
weeklySummary(userId: string, weekOf?: Date) => Promise<{
  tasksCompleted: number;
  tasksCreated: number;
  projectsAdvanced: Project[];
  cascadeEvents: number;
  contextBreakdown: { context: string; completed: number; created: number }[];
  staleProjects: Project[];        // No events this week
  mostActiveProjects: Project[];   // Most events this week
  delegationActivity: {
    delegatedToOthers: number;
    receivedFromOthers: number;
    waitingForResponses: number;
  };
  aiActivity: {
    inboxItemsProcessed: number;
    projectsCreated: number;
    tasksCreatedViaAI: number;
  };
}>
```

---

## UI Surfaces

### Task Detail: History Timeline

Every task detail view includes a collapsible history timeline at the bottom. It shows events in reverse chronological order with human-readable descriptions.

```
─── History ──────────────────────────────────────

  Today, 2:14 PM — Jason
  ✓ Completed task
  
  Today, 2:14 PM — Cascade Engine
  ⚡ Triggered: "Send PO to vendor" is now available
  ⚡ Triggered: "Schedule kickoff meeting" is now available
  
  Yesterday, 9:30 AM — Jason (via AI Assistant)  
  ✏ Changed context: @office → @home
  ✏ Changed energy: high → low
  💬 "Realized I can do this from my home desk"
  
  Feb 18, 11:00 AM — Brother
  👤 Delegated to Jason
  💬 "You have the vendor contact info"
  
  Feb 15, 3:45 PM — Jason
  ➕ Created task
  📁 Added to project "Vendor Onboarding"
  🏷 Context: @office | Energy: high | Time: 30min

──────────────────────────────────────────────────
```

### Project Detail: Cascade Visualization

Projects show a compact view of cascade chains — which completions triggered which promotions.

### Activity Feed (Dashboard)

A global feed showing recent activity across all tasks and projects. Filterable by source (manual, AI, cascade, delegation).

### Weekly Review: History-Powered Insights

The weekly review pulls from the history to surface:
- Tasks completed this week (with cascade chains)
- Projects that advanced vs. stalled
- Items created by AI vs. manually
- Delegation activity
- Context distribution (where you spent your time)

---

## AI Integration Points

The history system feeds directly into the AI features from the AI integration spec.

### MCP Tools (Additions)

```typescript
const historyTools = [
  {
    name: "task_history",
    description: 
      "View the change history for a specific task. " +
      "Shows who changed what, when, and why — including " +
      "cascade events and AI-assisted changes.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        limit: { type: "number", description: "Max events (default 20)" }
      },
      required: ["taskId"]
    }
  },
  {
    name: "activity_feed",
    description: 
      "Show recent activity across all tasks and projects. " +
      "Great for catching up on what happened today or this week.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Look back N days (default 7)" },
        source: { 
          type: "string", 
          enum: ["all", "manual", "ai", "cascade", "delegation"],
          description: "Filter by how changes were made"
        }
      }
    }
  },
  {
    name: "weekly_summary",
    description: 
      "Generate a summary of this week's GTD activity. " +
      "Includes completions, cascade chains, delegation status, " +
      "stale projects, and AI usage stats.",
    inputSchema: {
      type: "object",
      properties: {
        weekOf: { type: "string", format: "date", description: "Start of week (default: current)" }
      }
    }
  },
  {
    name: "cascade_trace",
    description: 
      "Trace the full cascade chain from a specific event. " +
      "Shows how completing one task rippled through projects " +
      "and unblocked downstream work.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" }
      },
      required: ["eventId"]
    }
  },
  {
    name: "task_revert",
    description: 
      "Revert a task to a previous state. Creates new events " +
      "(doesn't delete history). Use task_history first to find " +
      "the event you want to revert to.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        eventId: { type: "string", description: "Revert to the state before this event" },
        message: { type: "string", description: "Why are you reverting?" }
      },
      required: ["taskId", "eventId"]
    }
  }
];
```

### AI-Powered History Analysis

The embedded AI assistant can use history data to provide insights:

```
User: What happened with the vendor onboarding project this week?

AI: [calls activity_feed filtered to project]

Here's the rundown for Vendor Onboarding this week:

• Monday: Your brother delegated "Get budget approval" to you
• Wednesday: You completed "Get budget approval" — this triggered 
  a cascade that unblocked 2 tasks:
  → "Send PO to vendor" became available (@computer, 30min)
  → "Schedule kickoff meeting" became available (@phone, 15min)
• Thursday: You completed "Send PO to vendor"
• The project advanced from step 3/8 to step 5/8 this week.

Still waiting: "Schedule kickoff meeting" is available @phone 
whenever you're ready. After that, the next step is 
"Prepare onboarding documents" which is currently blocked on it.
```

### AI-Labeled Events

When the AI creates or modifies tasks, the events are tagged with `source: AI_EMBED` or `source: MCP`, making it easy to audit what the AI did vs. what the user did manually.

```
  Feb 20, 10:15 AM — Jason (via Claude, MCP)  
  🤖 Created task from project breakdown
  📁 Added to project "Birthday Party for Mom"
  🏷 Context: @errands | Energy: low | Time: 20min
```

---

## Data Lifecycle & Cleanup

### Retention Policy

Events are immutable but disk isn't infinite. Default retention:

- **Active tasks/projects**: Keep all events forever
- **Completed tasks**: Keep all events for 1 year, then compact to snapshots only
- **Archived/trashed**: Keep events for 90 days, then delete
- **Snapshots**: Keep the completion snapshot forever (it's small)

Users can override these in settings. Self-hosted = your storage, your rules.

### Storage Estimates

Each event is roughly 200-500 bytes (JSON diff + metadata). A very active user might generate 50-100 events per day. That's ~15-30 KB/day, or roughly 10 MB/year. Negligible on any modern system.

Snapshots are larger (~1-2 KB each) but created infrequently. Even aggressive snapshotting adds maybe 5 MB/year.

---

## Implementation Priority

### Build with Core v1.0
1. TaskEvent model and migration
2. Service layer middleware (diff computation, event creation)
3. Cascade chain tracking (triggeredBy linking)
4. Task detail history timeline UI
5. Basic activity feed

### Build with v1.1
6. ProjectEvent and InboxEvent models
7. Weekly summary endpoint
8. Snapshot system
9. Revert functionality
10. AI history tools (MCP + embedded)
11. Cascade visualization UI

### Build with v1.2+
12. Advanced analytics (time-in-status, throughput trends)
13. Export history (JSON, CSV for personal analytics)
14. History-powered AI coaching ("You tend to defer @phone tasks — want to batch those?")
15. Retention policy automation

---

## File Structure Additions

```
src/
├── lib/
│   ├── history/
│   │   ├── diff.ts              # Compute changes between two states
│   │   ├── event-writer.ts      # Create events within transactions
│   │   ├── cascade-tracer.ts    # Traverse triggeredBy chains
│   │   ├── snapshot.ts          # Create and restore snapshots
│   │   ├── state-at.ts          # Reconstruct state at timestamp
│   │   └── weekly-summary.ts    # Aggregate weekly stats
│   └── services/
│       ├── task-service.ts      # All task mutations go through here
│       ├── project-service.ts   # All project mutations go through here
│       └── inbox-service.ts     # All inbox mutations go through here
├── app/
│   └── api/
│       ├── tasks/
│       │   └── [id]/
│       │       └── history/
│       │           └── route.ts
│       └── history/
│           ├── feed/
│           │   └── route.ts
│           └── weekly-summary/
│               └── route.ts
└── components/
    └── history/
        ├── TaskTimeline.tsx      # Event log for task detail
        ├── ActivityFeed.tsx      # Global activity feed
        ├── CascadeTree.tsx       # Visual cascade chain
        ├── EventItem.tsx         # Single event display
        └── DiffDisplay.tsx       # Show what changed
```

---

## Relation to Existing Specs

This history system is referenced by and connects to:

- **AI Integration Spec** → History tools added to MCP server and embedded assistant
- **Weekly Review** → `weeklySummary` powers the Get Current phase with real data instead of manual memory
- **Cascade Engine** → Every cascade event writes to history with `triggeredBy` chain linking
- **Multi-User Collaboration** → Delegation events create clear accountability trail
- **Horizons of Focus** → Future: track how goals/vision evolve over time

The service layer pattern (all mutations go through service functions that write events) also enforces consistency — there's exactly one place where tasks get updated, whether the change comes from the UI, MCP, AI, cascade engine, or scheduler.
