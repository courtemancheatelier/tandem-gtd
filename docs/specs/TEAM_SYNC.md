# Tandem — Team Sync Spec

**Date:** February 25, 2026
**Extends:** TEAMS.md, TANDEM_SPEC.md §6 (Data Model), §3 (Cascade Engine)
**Status:** Draft for review

---

## Overview

Team Sync replaces traditional chat with **work-anchored communication** — every piece of team communication is either attached to the work it's about or generates work through GTD flows. There is no free-floating conversation. This is fundamentally different from Slack, Teams, or any chat-based collaboration tool.

### The Core Insight

Teams don't need another place to talk. They need the *human context* around their work to be visible — the "why" behind a completion, the decision that's blocking progress, the handoff note that prevents someone from starting from scratch. Traditional chat creates an open loop that never closes. Team Sync closes the loop by routing everything through GTD: communication either becomes action, reference, or resolved context.

### Three Layers

The system is built from three complementary layers, each adding structure:

| Layer | What | Schema Impact | Ships |
|-------|------|---------------|-------|
| **Enriched Events (D)** | Optional notes on task/project actions | One new field on existing models | v1.1 |
| **Work-Anchored Threads (A)** | Conversations attached to tasks/projects | New `Thread` + `ThreadMessage` models | v1.1 |
| **Decision Requests (C)** | Structured input-gathering with resolution | New `DecisionRequest` + `DecisionResponse` models | v1.2 |

Layer D is the foundation — nearly zero schema cost, immediate value. Layer A builds on it with richer conversation. Layer C adds formal decision workflow on top.

---

## 1. Layer D: Enriched Events

### 1.1 Concept

The activity feed already captures *what* changed. Enriched events add *why* — a human-authored note attached to any action. This is the lightest possible communication layer: no new models, no threads, no read tracking. Just context.

### 1.2 Schema Change

The `TaskEvent` and `ProjectEvent` models already have a `message` field:

```prisma
model TaskEvent {
  // ... existing fields ...
  message     String?       // Optional commit-message-style note ← THIS FIELD
}
```

**No schema migration needed.** The `message` field exists but is rarely populated today. The change is in the UI: when a team member takes an action on a team project, we prompt for a note.

### 1.3 When to Prompt

Not every action needs a note. The UI shows an optional "Add context for your team" input when:

- Completing a task in a team project
- Reassigning a task
- Changing a project's status (on hold, dropped, reactivated)
- Marking a Waiting For as resolved

The prompt is **never required** — it's a collapsible text field that defaults to collapsed. Power users skip it. People who want to communicate expand it.

### 1.4 How Enriched Events Surface

Enriched events (events with a non-null `message`) get special treatment in the activity feed:

```
Activity Feed — Camping Crew

  Today
  ✅ Jason completed "Confirm venue deposit"
     💬 "Venue confirmed for Sunday. Deposit paid — receipt in shared drive.
          Saturday was booked, so I pivoted. Menu still TBD."
  
  🔄 Jason reassigned "Plan meal schedule" → Mike
     💬 "Mike volunteered since he's doing the shopping anyway"

  Yesterday
  ⏸️ Sarah put "August Camping Trip" on hold
     💬 "Waiting on permit approval, probably 2-3 weeks"
```

Key behaviors:

- Enriched events are visually distinct from bare events (the note is displayed inline, not behind a click)
- The team activity feed filters to show only events from team projects (existing `scope` filtering applies)
- The Weekly Review surfaces enriched events from the past week in the "Get Current — Team Projects" section
- Enriched events do NOT create inbox items for teammates — they're passive context, not active communication

### 1.5 Notification Rules for Enriched Events

Enriched events follow a **pull, not push** model:

- No inbox items created
- No push notifications
- No email digests
- Visible in: team activity feed, project activity tab, Weekly Review team section

This is deliberate. Enriched events are ambient awareness, not interrupts. If you need someone's attention, use a thread (Layer A) or a decision request (Layer C).

---

## 2. Layer A: Work-Anchored Threads

### 2.1 Concept

When a note on an event isn't enough and actual back-and-forth is needed, a thread opens on any task or project. Threads are not chat — they have a **purpose type**, can be **resolved**, and integrate with GTD flows.

The closest analogy is GitHub issue comments, not Slack channels. A thread lives on the artifact it's about, has a finite lifespan, and reaches a conclusion.

### 2.2 Data Model

```prisma
// ============================================================================
// TEAM SYNC — THREADS
// ============================================================================

/// A conversation thread anchored to a task or project.
/// Every thread has a purpose and can be resolved.
model Thread {
  id            String       @id @default(cuid())
  
  // Anchor — exactly one must be set
  taskId        String?      @map("task_id")
  task          Task?        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  projectId     String?      @map("project_id")
  project       Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  // Thread metadata
  purposeType   ThreadPurpose
  title         String?      // Optional summary — auto-generated from first message if null
  
  // State
  isResolved    Boolean      @default(false) @map("is_resolved")
  resolvedAt    DateTime?    @map("resolved_at")
  resolvedById  String?      @map("resolved_by_id")
  resolvedBy    User?        @relation("ThreadsResolved", fields: [resolvedById], references: [id])
  
  // Ownership
  createdById   String       @map("created_by_id")
  createdBy     User         @relation("ThreadsCreated", fields: [createdById], references: [id])
  
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")
  
  // Relations
  messages      ThreadMessage[]
  mentions      ThreadMention[]
  
  // Optional escalation to decision request
  decisionRequest DecisionRequest?
  
  @@index([taskId])
  @@index([projectId])
  @@index([createdById])
  @@index([isResolved])
  @@map("threads")
}

/// A message within a thread.
model ThreadMessage {
  id          String   @id @default(cuid())
  threadId    String   @map("thread_id")
  thread      Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  
  authorId    String   @map("author_id")
  author      User     @relation(fields: [authorId], references: [id])
  
  content     String   @db.Text  // Markdown
  
  // Edit tracking
  isEdited    Boolean  @default(false) @map("is_edited")
  editedAt    DateTime? @map("edited_at")
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([threadId, createdAt])
  @@index([authorId])
  @@map("thread_messages")
}

/// Tracks @-mentions in threads to generate inbox items.
model ThreadMention {
  id          String   @id @default(cuid())
  threadId    String   @map("thread_id")
  thread      Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  messageId   String   @map("message_id")
  
  userId      String   @map("user_id")
  user        User     @relation(fields: [userId], references: [id])
  
  // GTD integration — did the mention generate an inbox item?
  inboxItemId String?  @map("inbox_item_id")
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@unique([messageId, userId])  // One mention per user per message
  @@index([userId])
  @@index([threadId])
  @@map("thread_mentions")
}

enum ThreadPurpose {
  QUESTION    // "Does anyone know...?" — seeking information
  BLOCKER     // "I'm stuck on..." — blocked, needs help to proceed
  UPDATE      // "FYI, here's what happened..." — informational
  FYI         // "Heads up..." — no response needed
}
```

### 2.3 Modified Models

**Task** and **Project** gain thread relations:

```prisma
model Task {
  // ... existing fields ...
  threads     Thread[]
}

model Project {
  // ... existing fields ...
  threads     Thread[]
}
```

**User** gains thread relations:

```prisma
model User {
  // ... existing fields ...
  
  // Team Sync
  threadsCreated   Thread[]         @relation("ThreadsCreated")
  threadsResolved  Thread[]         @relation("ThreadsResolved")
  threadMessages   ThreadMessage[]
  threadMentions   ThreadMention[]
}
```

### 2.4 Thread Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  CREATED │────►│  ACTIVE  │────►│ RESOLVED │
│          │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘
                       │                │
                       │                ▼
                       │          ┌──────────┐
                       └─────────►│ REOPENED │──► (back to ACTIVE)
                                  └──────────┘
```

State is tracked via `isResolved` rather than an enum — threads are either open or resolved. A resolved thread can be reopened by adding a new message, which sets `isResolved = false` and clears `resolvedAt`.

### 2.5 How Threads Enter GTD Flows

This is the critical design decision. Threads are not a parallel communication system — they feed into GTD:

#### Inbox Items from Mentions

When a user is @-mentioned in a thread:

1. System creates an inbox item: `"@Mike mentioned you on 'Plan meal schedule': Does the cooler fit 4 people's food?"`
2. The inbox item links back to the thread via `notes` containing the thread URL
3. The teammate processes it like any inbox item — respond in the thread, create a task from it, or trash it
4. The `ThreadMention` record tracks `inboxItemId` for the generated item

This means mentions are **not notifications** — they're captured inputs that enter the person's GTD system and get processed on their schedule.

#### Blocker Threads Create Waiting For

When a thread with `purposeType: BLOCKER` is created on a task:

1. The task's status can optionally be set to `WAITING`
2. A `WaitingFor` entry is auto-generated: "Waiting for team input on [thread title]"
3. When the thread is resolved, the `WaitingFor` is automatically marked resolved
4. The cascade engine evaluates whether the task should be promoted back to next action

#### Weekly Review Surfaces Open Threads

The Weekly Review's "Get Current — Team Projects" section now includes:

```
Get Current — Team Projects

🏕️ Camping Crew
  🔵 August Camping Trip
     💬 1 open thread: "Does the cooler fit 4 people's food?" (QUESTION, 3 days old)
     ⏳ Mike: "Plan meal schedule" (assigned 5 days ago)
  → Respond to open threads? Follow up with anyone?
```

Open threads on your tasks surface as review items. Open threads on tasks you created but assigned to others surface as follow-up prompts.

### 2.6 Thread Purpose Behaviors

Each purpose type has slightly different defaults:

| Purpose | Creates Inbox for Mentions? | Auto-creates Waiting For? | Shows in "What Now"? | Notification Urgency |
|---------|---------------------------|--------------------------|---------------------|---------------------|
| QUESTION | Yes | No | No | Normal |
| BLOCKER | Yes | Yes (linked to task) | Yes (as the task) | Elevated |
| UPDATE | Yes | No | No | Normal |
| FYI | No | No | No | Low |

FYI threads don't create inbox items even for mentions — they're purely ambient. If someone needs action, they should use QUESTION or BLOCKER.

### 2.7 Thread Permissions

Thread visibility follows project visibility:

```
Can see project? → Can see its threads
Can see task?    → Can see its threads
Team member?     → Can create threads on team project tasks
Task assignee?   → Can create threads on their assigned tasks
Thread author?   → Can edit/delete their own messages
Team admin?      → Can resolve any thread, delete any message
```

---

## 3. Layer C: Decision Requests

### 3.1 Concept

A Decision Request is a structured workflow for "I need input from specific people before I can proceed." It's the most formal communication layer — with explicit participants, optional deadlines, and state that connects to the cascade engine.

This is the PR-review pattern applied to non-technical teams: propose something, gather input, resolve, and unblock work.

### 3.2 Data Model

```prisma
// ============================================================================
// TEAM SYNC — DECISION REQUESTS
// ============================================================================

/// A structured request for input from specific team members.
/// Lives on a thread — the thread provides the discussion,
/// the decision request adds structured voting/approval workflow.
model DecisionRequest {
  id            String         @id @default(cuid())
  
  // Parent thread — every decision request lives inside a thread
  threadId      String         @unique @map("thread_id")
  thread        Thread         @relation(fields: [threadId], references: [id], onDelete: Cascade)
  
  // Decision metadata
  question      String         // Clear statement of what needs deciding
  context       String?        @db.Text  // Background / options being considered (Markdown)
  
  // State
  status        DecisionStatus @default(OPEN)
  resolution    String?        @db.Text  // What was decided (filled on resolve)
  resolvedAt    DateTime?      @map("resolved_at")
  
  // Deadline
  deadline      DateTime?      // Optional — when input is needed by
  
  // Ownership
  requestedById String         @map("requested_by_id")
  requestedBy   User           @relation("DecisionsRequested", fields: [requestedById], references: [id])
  
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")
  
  // Relations
  responses     DecisionResponse[]
  
  @@index([status])
  @@index([requestedById])
  @@index([deadline])
  @@map("decision_requests")
}

/// A respondent's input on a decision request.
model DecisionResponse {
  id                String    @id @default(cuid())
  decisionRequestId String    @map("decision_request_id")
  decisionRequest   DecisionRequest @relation(fields: [decisionRequestId], references: [id], onDelete: Cascade)
  
  respondentId      String    @map("respondent_id")
  respondent        User      @relation(fields: [respondentId], references: [id])
  
  vote              DecisionVote
  comment           String?   @db.Text  // Optional explanation
  
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  
  @@unique([decisionRequestId, respondentId])  // One response per person
  @@index([respondentId])
  @@map("decision_responses")
}

/// Tracks who has been asked to respond (separate from who HAS responded).
model DecisionRespondent {
  id                String    @id @default(cuid())
  decisionRequestId String    @map("decision_request_id")
  
  userId            String    @map("user_id")
  user              User      @relation(fields: [userId], references: [id])
  
  // GTD integration
  inboxItemId       String?   @map("inbox_item_id")  // Generated inbox item
  
  createdAt         DateTime  @default(now()) @map("created_at")
  
  @@unique([decisionRequestId, userId])
  @@index([userId])
  @@map("decision_respondents")
}

enum DecisionStatus {
  OPEN        // Awaiting responses
  RESOLVED    // Decision made
  EXPIRED     // Deadline passed without resolution
  WITHDRAWN   // Requester cancelled
}

enum DecisionVote {
  APPROVE     // "Yes, go ahead"
  REJECT      // "No, don't do this"
  COMMENT     // "I have thoughts but no strong opinion"
  DEFER       // "I trust the group / don't have enough context"
}
```

### 3.3 Modified Models

**User** gains decision relations:

```prisma
model User {
  // ... existing fields ...
  
  // Decision Requests
  decisionsRequested  DecisionRequest[]   @relation("DecisionsRequested")
  decisionResponses   DecisionResponse[]
  decisionRespondents DecisionRespondent[]
}
```

### 3.4 Decision Request Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│   OPEN   │────►│ RESOLVED │     │  WITHDRAWN   │
│          │     │          │     │              │
└──────────┘     └──────────┘     └──────────────┘
     │                                    ▲
     │                                    │
     ▼                                    │
┌──────────┐                              │
│ EXPIRED  │         (requester cancels)──┘
└──────────┘
```

State transitions:

- **OPEN → RESOLVED:** Requester reviews responses and records a resolution. Doesn't require all respondents to have voted — the requester decides when they have enough input.
- **OPEN → EXPIRED:** System sets this when deadline passes and status is still OPEN. Expired decisions can still be resolved manually.
- **OPEN → WITHDRAWN:** Requester cancels (question became moot, decided independently, etc.)

### 3.5 How Decision Requests Enter GTD Flows

#### Inbox Items for Respondents

When a decision request is created and respondents are specified:

1. Each respondent gets an inbox item: `"Jason needs your input: Should we switch the camping trip to Sunday?"`
2. The inbox item includes a deep link to the decision request
3. Processing the inbox item = going to the decision and submitting a response
4. The `DecisionRespondent` tracks `inboxItemId` for cleanup

#### "What Should I Do Now?" Integration

Pending decision requests where the current user is an unresponded respondent show up in the "What Should I Do Now?" view:

```
What Should I Do Now?
  Context: @computer  Energy: Any  Time: < 30min

  🗳️ Decision needed: "Sunday or Saturday for camping?"    5min  🟢
     From: Jason · Camping Crew · Due: Thursday
  📋 Review PR for auth module          (Acme Corp)        15min  🟢
  📋 Update camping checklist           (Camping Crew)      20min  🟢
```

Decision requests surface as actionable items with:
- Inferred time estimate of 5 minutes (configurable, overridable)
- Energy level: LOW (most decisions are quick input)
- Context: inherited from the parent task's context, or @computer as default

#### Waiting For Integration

When you create a decision request:

1. A `WaitingFor` entry is auto-generated: "Waiting for team decision on [question]"
2. `WaitingFor.delegatedTo` is set to the list of respondent names
3. When the decision resolves, the `WaitingFor` auto-resolves

#### Cascade Integration

If the decision request's parent thread is on a task, resolving the decision can trigger cascade evaluation:

1. Decision resolves → parent thread resolves → task status can transition from WAITING to NOT_STARTED/IN_PROGRESS
2. The cascade engine checks if the task should now be promoted to next action
3. This creates a clean chain: blocked on decision → decision resolved → task unblocked → next action promoted

---

## 4. Event System Integration

### 4.1 New Event Types

Add to existing enums:

```prisma
enum TaskEventType {
  // ... existing values ...
  THREAD_OPENED       // New thread created on this task
  THREAD_RESOLVED     // Thread on this task was resolved
  DECISION_REQUESTED  // Decision request created on this task
  DECISION_RESOLVED   // Decision request resolved on this task
}

enum ProjectEventType {
  // ... existing values ...
  THREAD_OPENED
  THREAD_RESOLVED
  DECISION_REQUESTED
  DECISION_RESOLVED
}
```

### 4.2 Event Source

Thread and decision events use a new `EventSource` value:

```prisma
enum EventSource {
  // ... existing values ...
  TEAM_SYNC   // Events generated by thread/decision workflows
}
```

### 4.3 Activity Feed Integration

The activity feed gains new event renderings:

```
Activity Feed — Camping Crew

  Today
  💬 Jason opened a thread on "Book campsite": "Does anyone have a parks pass?"
  🗳️ Jason requested a decision: "Sunday or Saturday for camping trip?"
     Waiting on: Mike, Sarah
  
  Yesterday
  ✅ Mike responded to "Sunday or Saturday?": Approve (Sunday) — "Works for me"
  ✅ Sarah responded to "Sunday or Saturday?": Approve (Sunday)
  🎯 Jason resolved "Sunday or Saturday?": "Going with Sunday — everyone agreed"
  ✅ Jason resolved thread "Does anyone have a parks pass?"
```

### 4.4 Enriched Event Format in Activity Feed

Existing events with messages display the enriched context:

```typescript
// EventItem rendering logic (pseudo-code)
function renderEvent(event: TaskEvent | ProjectEvent) {
  const base = formatEventDescription(event);
  
  // If event has a message, render it as an enriched event
  if (event.message) {
    return (
      <EventItem>
        <EventDescription>{base}</EventDescription>
        <EventNote>{event.message}</EventNote>  {/* New: inline note */}
      </EventItem>
    );
  }
  
  return <EventItem><EventDescription>{base}</EventDescription></EventItem>;
}
```

---

## 5. UI

### 5.1 Enriched Event Input (Layer D)

When completing a task in a team project, the completion dialog gains an optional note field:

```
┌─────────────────────────────────────────────┐
│  ✅ Complete "Confirm venue deposit"?       │
│                                             │
│  ┌─ Add context for your team (optional) ─┐ │
│  │ Venue confirmed for Sunday. Deposit     │ │
│  │ paid — receipt in shared drive.         │ │
│  └─────────────────────────────────────────┘ │
│                                             │
│            [Cancel]    [Complete]            │
└─────────────────────────────────────────────┘
```

For reassignment, the note field appears inline:

```
┌─────────────────────────────────────────────┐
│  Reassign "Plan meal schedule"              │
│                                             │
│  Assign to: [Mike ▾]                        │
│                                             │
│  Note: Mike volunteered since he's          │
│  doing the shopping anyway                  │
│                                             │
│            [Cancel]    [Reassign]            │
└─────────────────────────────────────────────┘
```

### 5.2 Thread Panel (Layer A)

Threads appear in a side panel when viewing a task or project, similar to GitHub's conversation tab:

```
┌──────────────────────────────────────────────────────┐
│  📋 Task: Book campsite reservation                  │
│                                                      │
│  [Details]  [History]  [Threads (2)]                 │
│                                                      │
│  ┌─ 💬 QUESTION — "Does anyone have a parks pass?" ─┐│
│  │                                                   ││
│  │  Jason · 2 days ago                               ││
│  │  I need a parks pass for the reservation.         ││
│  │  Does anyone have one we can use?                 ││
│  │                                                   ││
│  │  Mike · 1 day ago                                 ││
│  │  Yeah, mine is valid through October.             ││
│  │  I'll send you the number.                        ││
│  │                                                   ││
│  │  Jason · 1 day ago                                ││
│  │  Perfect, got it. ✅ Resolved                     ││
│  └───────────────────────────────────────────────────┘│
│                                                      │
│  ┌─ 🚧 BLOCKER — "Site availability unclear" ───────┐│
│  │  Sarah · 3 hours ago                              ││
│  │  The website shows Site 14 as available but       ││
│  │  when I try to book it errors out. Can someone    ││
│  │  try calling?                                     ││
│  │                                          [Reply]  ││
│  └───────────────────────────────────────────────────┘│
│                                                      │
│  [+ New Thread]                                      │
└──────────────────────────────────────────────────────┘
```

### 5.3 New Thread Creation

```
┌──────────────────────────────────────────────┐
│  New Thread on "Book campsite reservation"   │
│                                              │
│  Purpose:                                    │
│  [❓Question] [🚧Blocker] [📢Update] [ℹ️FYI] │
│                                              │
│  Message:                                    │
│  ┌──────────────────────────────────────────┐│
│  │ Does anyone have a parks pass? I need    ││
│  │ one for the reservation system.          ││
│  └──────────────────────────────────────────┘│
│                                              │
│  Mention: [@Mike ▾] [+ Add]                  │
│                                              │
│            [Cancel]    [Create Thread]        │
└──────────────────────────────────────────────┘
```

### 5.4 Decision Request UI (Layer C)

Decision requests render within their parent thread with a structured card:

```
┌──────────────────────────────────────────────────────┐
│  🗳️ DECISION REQUEST                                │
│                                                      │
│  "Should we switch the camping trip to Sunday?"      │
│                                                      │
│  Context:                                            │
│  Saturday venue is booked. Sunday is available at     │
│  the same price. Only difference is checkout is 2pm  │
│  instead of 4pm on Sunday.                           │
│                                                      │
│  Deadline: Thursday, Feb 27                          │
│                                                      │
│  ┌─ Responses ─────────────────────────────────────┐ │
│  │  ✅ Mike: Approve — "Works for me"              │ │
│  │  ✅ Sarah: Approve — "Sunday is actually better"│ │
│  │  ⏳ Dave: Pending                               │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  [Your response:]                                    │
│  [👍 Approve] [👎 Reject] [💬 Comment] [🤷 Defer]    │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ Add a comment (optional)...                      ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ── Only visible to requester: ──────────────────── │
│  [Resolve Decision]  [Withdraw]                      │
└──────────────────────────────────────────────────────┘
```

Resolution dialog:

```
┌──────────────────────────────────────────────┐
│  Resolve Decision                            │
│                                              │
│  "Should we switch to Sunday?"               │
│  2/3 responded · All approvals               │
│                                              │
│  Resolution:                                 │
│  ┌──────────────────────────────────────────┐│
│  │ Going with Sunday — everyone who         ││
│  │ responded agreed. Dave hasn't responded  ││
│  │ but said he's flexible.                  ││
│  └──────────────────────────────────────────┘│
│                                              │
│            [Cancel]    [Resolve]              │
└──────────────────────────────────────────────┘
```

### 5.5 Team Dashboard Integration

The team dashboard from TEAMS.md gains a "Recent Activity" section showing enriched events and thread summaries:

```
┌──────────────────────────────────────────────────────────┐
│  🏕️ Camping Crew                          [⚙️ Settings] │
│                                                          │
│  Members                                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │  👤 J  │ │  👤 M  │ │  👤 S  │ │  👤 D  │  [+Invite]│
│  └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                          │
│  Open Items                                              │
│  🚧 1 blocker thread  · 🗳️ 0 pending decisions          │
│  ⏳ 2 items waiting on others                            │
│                                                          │
│  Recent Activity                                         │
│  ✅ Jason completed "Confirm venue deposit"              │
│     💬 "Venue confirmed for Sunday. Deposit paid."       │
│  🔄 Jason reassigned "Plan meal schedule" → Mike         │
│  💬 Sarah opened blocker: "Site availability unclear"    │
│                                                          │
│  Projects                                   [+ Project]  │
│  🔵 August Camping Trip      12 tasks, 4 next actions   │
└──────────────────────────────────────────────────────────┘
```

### 5.6 "What Should I Do Now?" — Decision Items

Pending decisions render as a distinct item type:

```
What Should I Do Now?
  Context: @computer  Energy: Any  Time: < 30min

  🗳️ Decision: "Sunday or Saturday for camping?"     ~5min  🟢
     Jason is waiting on you · Due Thu · Camping Crew
  📋 Review PR for auth module                       15min  🟢
  📋 Email venue about Saturday setup                10min  🟡
```

Clicking the decision item opens the decision request panel directly.

---

## 6. API Surface

### 6.1 New Endpoints

```
Threads:
  POST   /api/threads                     Create thread (on task or project)
  GET    /api/threads/:id                 Get thread with messages
  PATCH  /api/threads/:id                 Update thread (title, resolve)
  DELETE /api/threads/:id                 Delete thread (author or admin)
  POST   /api/threads/:id/messages        Add message to thread
  PATCH  /api/threads/:id/messages/:mid   Edit message
  DELETE /api/threads/:id/messages/:mid   Delete message

  GET    /api/tasks/:id/threads           List threads on a task
  GET    /api/projects/:id/threads        List threads on a project

Decision Requests:
  POST   /api/decisions                   Create decision request (creates thread too)
  GET    /api/decisions/:id               Get decision with responses
  PATCH  /api/decisions/:id               Update (resolve, withdraw, extend deadline)
  POST   /api/decisions/:id/respond       Submit or update your response
  GET    /api/decisions/pending           List decisions awaiting your input

Activity:
  GET    /api/teams/:id/activity          Team activity feed (enriched events + threads)
```

### 6.2 Modified Endpoints

```
Tasks:
  POST /api/tasks/:id/complete  — now accepts optional `note` param (enriched event)
  PATCH /api/tasks/:id          — now accepts optional `note` param for team-visible changes

Projects:
  PATCH /api/projects/:id       — now accepts optional `note` param for status changes
```

### 6.3 MCP Integration

The MCP server gains thread-aware tools:

```typescript
// New MCP tools
{
  name: "tandem_thread_create",
  description: "Create a thread on a task or project to discuss with team members.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "Task to attach thread to" },
      projectId: { type: "string", description: "Project to attach thread to" },
      purposeType: { 
        type: "string", 
        enum: ["QUESTION", "BLOCKER", "UPDATE", "FYI"],
        description: "Purpose of the thread"
      },
      message: { type: "string", description: "First message content" },
      mentionUserIds: { 
        type: "array", items: { type: "string" },
        description: "User IDs to @-mention"
      },
    },
    required: ["message", "purposeType"],
  },
},
{
  name: "tandem_thread_list",
  description: "List open threads on tasks or projects. Useful for checking what needs attention.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" },
      projectId: { type: "string" },
      includeResolved: { type: "boolean", default: false },
    },
  },
},
{
  name: "tandem_decision_create",
  description: "Create a decision request to gather input from team members.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" },
      projectId: { type: "string" },
      question: { type: "string", description: "What needs deciding" },
      context: { type: "string", description: "Background and options" },
      respondentIds: { 
        type: "array", items: { type: "string" },
        description: "User IDs who should weigh in"
      },
      deadline: { type: "string", description: "ISO 8601 deadline" },
    },
    required: ["question"],
  },
},
{
  name: "tandem_decision_respond",
  description: "Respond to a decision request.",
  inputSchema: {
    type: "object",
    properties: {
      decisionId: { type: "string" },
      vote: { type: "string", enum: ["APPROVE", "REJECT", "COMMENT", "DEFER"] },
      comment: { type: "string" },
    },
    required: ["decisionId", "vote"],
  },
},
{
  name: "tandem_decision_list_pending",
  description: "List decision requests awaiting your input.",
  inputSchema: {
    type: "object",
    properties: {},
  },
}
```

---

## 7. GTD Integration Summary

This section consolidates how Team Sync feeds into every GTD surface:

### 7.1 Inbox

| Trigger | Inbox Item Created? | Content |
|---------|-------------------|---------|
| @-mentioned in QUESTION thread | Yes | "[Name] asked: [first 100 chars]" |
| @-mentioned in BLOCKER thread | Yes | "[Name] is blocked: [first 100 chars]" |
| @-mentioned in UPDATE thread | Yes | "[Name] shared update: [first 100 chars]" |
| @-mentioned in FYI thread | **No** | (Ambient only) |
| Added as decision respondent | Yes | "[Name] needs your input: [question]" |
| Decision resolved (for respondents) | **No** | (Visible in activity feed) |
| Enriched event on your task | **No** | (Visible in activity feed) |

### 7.2 Weekly Review

The "Get Current — Team Projects" section now surfaces:

1. **Open BLOCKER threads** on any task in your team projects (highest priority)
2. **Pending decision requests** where you haven't responded
3. **Unresolved QUESTION threads** on tasks assigned to you
4. **Enriched events from the past week** — a digest of team context you may have missed
5. **Stale threads** — open threads with no activity for 7+ days

### 7.3 "What Should I Do Now?"

Two new item types appear alongside regular tasks:

1. **Pending decision responses** — decisions where you're a respondent and haven't voted
2. **Blocker thread responses** — open BLOCKER threads on tasks assigned to you or where you're mentioned

These are filtered by context/energy/time the same as tasks. Default estimates:
- Decision response: 5 minutes, LOW energy, @computer context
- Blocker thread: 10 minutes, MEDIUM energy, inherits task context

### 7.4 Waiting For

Auto-generated entries:

| Trigger | Waiting For Entry | Auto-resolves When |
|---------|------------------|-------------------|
| Created BLOCKER thread | "Waiting for team input on [title]" | Thread resolved |
| Created decision request | "Waiting for decision on [question]" | Decision resolved/withdrawn |
| Assigned task with note | (Existing behavior, unchanged) | Task completed |

### 7.5 Cascade Engine

The cascade engine gains two new triggers:

1. **Thread resolution on WAITING task:** If a task's status is WAITING and linked to a BLOCKER thread, resolving the thread evaluates whether the task should transition to NOT_STARTED and be promoted to next action.
2. **Decision resolution:** Same as above — if the decision's parent thread is on a WAITING task, resolution triggers cascade evaluation.

Both follow the existing cascade algorithm — they just add new ways a task can become unblocked.

---

## 8. Notification Strategy

Team Sync deliberately avoids real-time notification pressure. The hierarchy:

### 8.1 Notification Tiers

| Event | In-App Badge | Push Notification | Email Digest |
|-------|-------------|-------------------|-------------|
| @-mention (QUESTION/BLOCKER/UPDATE) | Yes (inbox count) | Optional (user pref) | Weekly digest |
| Decision request assigned | Yes (inbox count) | Yes (deadline-aware) | Weekly digest |
| Decision approaching deadline | No | Yes (24h before) | No |
| Decision resolved | No | No | Weekly digest |
| Thread resolved | No | No | No |
| Enriched event | No | No | No |
| FYI mention | No | No | No |

### 8.2 Push Notification Rules

Push notifications are opt-in per team and follow these rules:

- **Never sent for enriched events or FYI threads** — these are ambient context only
- **Decision deadlines** get one push notification 24 hours before deadline (if user has push enabled)
- **BLOCKER threads** on tasks assigned to you get one push notification on creation (if user has push enabled)
- **All other mentions** respect the user's notification preference (default: off)

### 8.3 Digest Email

A weekly digest email (optional, off by default) summarizes:

- Pending decisions awaiting your input
- Open threads you're mentioned in
- Enriched event highlights from your teams

This ships after the weekly review notification system is in place.

---

## 9. Roadmap Placement

### v1.1 — Enriched Events + Basic Threads

Ships alongside flat teams from TEAMS.md:

- **Enriched Events (Layer D):** Note field on completion/reassignment/status change for team projects. Activity feed rendering of enriched events. Weekly Review integration.
- **Basic Threads (Layer A):** Thread CRUD on tasks and projects. Four purpose types. @-mention with inbox item generation. Thread resolution. No MCP tools yet.

This gives teams immediate value with minimal schema additions.

### v1.2 — Decision Requests + Thread Polish

Ships alongside team hierarchy from TEAMS.md:

- **Decision Requests (Layer C):** Full decision workflow with respondents, votes, deadlines. "What Should I Do Now?" integration. Cascade engine integration. WaitingFor auto-generation.
- **Thread Polish:** MCP tools for threads and decisions. Push notification support. Digest email. Thread search (via existing global search infrastructure).

### v1.3 — Advanced

- Thread reactions (lightweight acknowledgment without a full message)
- Decision templates (recurring decisions with pre-set respondents)
- Thread-to-task conversion (turn a thread message into an inbox item or task directly)
- AI thread summarization (Claude summarizes a long thread into key points)

---

## 10. Migration Path

### From v1.0 (no teams) to v1.1 (teams + sync)

- All new tables — no existing data affected
- Enriched events work immediately on any `TaskEvent.message` or `ProjectEvent.message` that gets populated
- Threads are additive — no existing functionality changes

### From v1.1 to v1.2 (decision requests)

- New tables only (`DecisionRequest`, `DecisionResponse`, `DecisionRespondent`)
- New enum values added to `TaskEventType` and `ProjectEventType`
- New `EventSource.TEAM_SYNC` value
- Existing threads and enriched events continue working unchanged

---

## 11. Design Principles

These principles guided every decision in this spec:

1. **The work is the conversation.** Communication lives on the artifact it's about. No separate channels, no context-switching to a chat app.

2. **Pull, not push.** Team communication enters your GTD system through the inbox and surfaces during review — not as real-time interrupts. You process team input on your schedule.

3. **Every communication resolves.** Threads close. Decisions resolve. Enriched events are context, not conversations. Nothing becomes an infinite scroll.

4. **Use existing primitives.** Enriched events use the existing `message` field. Blocker threads create WaitingFor entries. Decision respondents get inbox items. The cascade engine handles unblocking. No parallel systems.

5. **Ambient before active.** Layer D (enriched events) is ambient — no notifications, no inbox items. Layer A (threads) escalates to inbox items only for mentions. Layer C (decisions) is the most active — it puts items in "What Should I Do Now?" Only escalate when the situation warrants it.

6. **Personal GTD stays sacred.** Team sync adds awareness, not obligation. Your personal tasks, projects, and reviews are never polluted by team noise. Team items appear in your unified views only when they're assigned to you or explicitly need your input.
