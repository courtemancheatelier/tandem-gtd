# Task Delegation — Feature Spec

**Document:** `docs/specs/TASK_DELEGATION.md`
**Status:** Draft — ready for implementation
**Author:** Jason Courtemanche / Courtemanche Atelier
**Depends on:** `TEAMS.md` (team membership model), `TANDEM_SPEC.md` (base schema)

---

## 1. Problem & Goal

Today, "delegation" in Tandem means entering a free-text name in the inbox processing wizard. This creates a WaitingFor record on your side but nothing happens for the recipient — there's no in-app delivery, no cross-user handoff. The delegator still has to IM, email, or call to let the other person know.

**Goal:** When you delegate a task to a user on the same Tandem server, the task appears in their inbox (or directly in their Do Now list), creates a Waiting For record on your side automatically, and notifies them — all without any out-of-band communication.

**Non-goal:** Federation across separate servers is handled separately. This spec covers **same-server delegation only**.

---

## 2. Scope

| Scenario | Covered |
|---|---|
| Delegate to a Tandem user on the same server | ✅ |
| Delegate to an external person (free-text name) | ✅ (existing behavior, unchanged) |
| Delegate from the inbox processing wizard | ✅ |
| Delegate from a task detail view (post-creation) | ✅ |
| Delegate from a team/shared project context | ✅ |
| Recipient accept / decline | ✅ |
| Delegator notified on completion | ✅ |
| Cross-server delegation | ❌ (future: Federation spec) |

---

## 3. Core Concepts

### 3.1 Delegation vs. Assignment

These two concepts are related but distinct:

| | **Delegation** | **Assignment** |
|---|---|---|
| Source | You hand something off | A task was created for you in a shared project |
| Recipient landing | Inbox (requires a decision) | Task is created directly in their task list |
| Delegator view | Waiting For | "Assigned by me" sub-view (future) |
| Semantic meaning | "I'm asking you to handle this" | "This task belongs to you in our shared work" |

This spec covers **delegation**. Project-level assignment (where a team lead creates tasks with `assignedToId`) continues to work as designed — those tasks bypass the delegation handshake and land directly in the recipient's task list.

### 3.2 Where Delegated Tasks Land

The **delegator** controls where the task lands for the recipient:

| Option | When to Use |
|---|---|
| **Inbox** (default) | When you're asking someone to handle something, and want them to clarify it and own the routing |
| **Do Now** | When it's urgent and clearly defined — you want it to surface immediately in their work surface |

"Do Now" means `isNextAction: true` on creation, bypassing inbox processing.

### 3.3 Waiting For — Auto-Created

When a delegation is sent, a WaitingFor record is automatically created on the delegator's side. This replaces the manual WaitingFor entry that previously had to be created separately. The WaitingFor record:

- Links to the delegated task via `delegatedTaskId`
- Tracks the delegated user via `delegatedUserId` (not just a free-text name)
- Updates automatically when the recipient accepts, declines, or completes

---

## 4. Data Model Changes

### 4.1 New `Delegation` Model

```prisma
model Delegation {
  id              String           @id @default(cuid())

  // The task being delegated
  taskId          String           @map("task_id")
  task            Task             @relation(fields: [taskId], references: [id], onDelete: Cascade)

  // Parties
  delegatorId     String           @map("delegator_id")
  delegator       User             @relation("DelegationsGiven", fields: [delegatorId], references: [id])
  delegateeId     String           @map("delegatee_id")
  delegatee       User             @relation("DelegationsReceived", fields: [delegateeId], references: [id])

  // State machine
  status          DelegationStatus @default(PENDING)

  // Delegator's routing preference for recipient
  landingZone     DelegationLanding @default(INBOX)

  // Optional message from delegator
  note            String?

  // Timestamps
  sentAt          DateTime         @default(now()) @map("sent_at")
  viewedAt        DateTime?        @map("viewed_at")      // when recipient first saw it
  respondedAt     DateTime?        @map("responded_at")   // accept or decline
  completedAt     DateTime?        @map("completed_at")   // task completed by recipient

  // Decline reason (optional)
  declineReason   String?          @map("decline_reason")

  // Link back to delegator's WaitingFor record
  waitingForId    String?          @unique @map("waiting_for_id")
  waitingFor      WaitingFor?      @relation(fields: [waitingForId], references: [id])

  @@index([delegatorId])
  @@index([delegateeId])
  @@index([status])
  @@map("delegations")
}

enum DelegationStatus {
  PENDING    // Sent, not yet seen by recipient
  VIEWED     // Recipient opened the task
  ACCEPTED   // Recipient accepted and routed it
  DECLINED   // Recipient declined
  COMPLETED  // Task marked complete by recipient
  RECALLED   // Delegator cancelled before recipient acted
}

enum DelegationLanding {
  INBOX    // Lands in recipient's inbox for processing
  DO_NOW   // Lands directly as a next action (urgent)
}
```

### 4.2 Changes to Existing Models

**`Task`** — add delegation relation:
```prisma
model Task {
  // ... existing fields ...
  delegation       Delegation?  // Present if this task was delegated to the task owner
  delegatedOut     Delegation[] // Present if this task was delegated by the task owner (edge case: re-delegation)
}
```

**`WaitingFor`** — add user link and delegation back-reference:
```prisma
model WaitingFor {
  // ... existing fields ...
  delegatedUserId  String?    @map("delegated_user_id")  // null for external/free-text
  delegatedUser    User?      @relation(fields: [delegatedUserId], references: [id])
  delegation       Delegation? // auto-populated for same-server delegations
}
```

**`Notification`** — new model (if not yet present):
```prisma
model Notification {
  id         String           @id @default(cuid())
  userId     String           @map("user_id")
  user       User             @relation(fields: [userId], references: [id])
  type       NotificationType
  payload    Json             // type-specific data (delegationId, taskTitle, delegatorName, etc.)
  readAt     DateTime?        @map("read_at")
  createdAt  DateTime         @default(now()) @map("created_at")

  @@index([userId, readAt])
  @@map("notifications")
}

enum NotificationType {
  DELEGATION_RECEIVED
  DELEGATION_ACCEPTED
  DELEGATION_DECLINED
  DELEGATION_COMPLETED
  DELEGATION_RECALLED
}
```

> **Migration note:** No destructive changes. All new fields are nullable or on new tables. The `WaitingFor.delegatedUserId` column is additive. Existing free-text WaitingFor records are unaffected.

---

## 5. Delegation State Machine

```
Delegator sends task
        │
        ▼
   [PENDING] ──────────────────────── Delegator recalls ──► [RECALLED]
        │
   Recipient opens notification
        │
        ▼
   [VIEWED]
        │
   ┌────┴─────┐
   │          │
Accepts    Declines (optional reason)
   │          │
   ▼          ▼
[ACCEPTED] [DECLINED] ──► WaitingFor closed; task returned to delegator's inbox
   │
Recipient completes task
   │
   ▼
[COMPLETED] ──► WaitingFor auto-resolved; delegator notified
```

**Recall window:** Delegator can recall any delegation that is `PENDING` or `VIEWED` (i.e., not yet accepted). Once accepted, recall is not available — the delegator must communicate directly with the recipient to request the task back.

---

## 6. UI — Delegating a Task

### 6.1 Inbox Processing Wizard (Step 2b — Delegate toggle)

Existing UI has a "Delegate this?" toggle with a free-text input. This is upgraded:

```
┌─ Delegate This Task? ──────────────────────────────────────────┐
│                                                                 │
│  ○ No — keep for myself                                         │
│  ● Yes — delegate to someone on this server                     │
│  ○ External — log for someone outside Tandem (free text)        │
│                                                                 │
│  [When "Yes" selected:]                                         │
│                                                                 │
│  Delegate to:  [ Search team members...          ▼ ]            │
│                  ┌───────────────────────────────┐              │
│                  │ 👤 Maria Sanchez              │              │
│                  │ 👤 David Park                 │              │
│                  └───────────────────────────────┘              │
│                                                                 │
│  Landing zone:  ● Inbox (they'll clarify and route it)          │
│                 ○ Do Now (surface immediately as next action)   │
│                                                                 │
│  Note (optional): ________________________________________      │
│                                                                 │
│  [When "External" selected:]                                    │
│  Person's name: [ _________________________________ ]           │
│  (Creates a waiting-for note only — no in-app delivery)         │
└─────────────────────────────────────────────────────────────────┘
```

**Typeahead behavior:** The user search queries `GET /api/users/search?q=` filtered to users the delegator shares at least one team with. Server-wide user browsing is not exposed for privacy.

### 6.2 Task Detail — Delegate Action

Any existing task (not already delegated) can be delegated via the task detail panel:

```
Task: "Draft the tango workshop announcement copy"
  ┌──────────────────────────────────────────────────┐
  │  [ Complete ]  [ Edit ]  [ Defer ]  [ Delegate ] │
  └──────────────────────────────────────────────────┘
```

Clicking **Delegate** opens a bottom sheet / modal with the same controls as above (recipient picker, landing zone, optional note).

On confirm:
1. Task `assignedToId` is set to `delegatee.id`
2. Task `userId` remains the delegator's (the delegator retains ownership until accepted)
3. A `Delegation` record is created
4. A WaitingFor record is auto-created on the delegator's side
5. A `Notification` is created for the recipient
6. Task moves off delegator's active lists and appears in their Waiting For view

### 6.3 Delegator View — Task in Waiting For

Once delegated, the task no longer appears in the delegator's Do Now or Next Actions. It appears in **Waiting For**:

```
Waiting For

  ⏳  Draft the tango workshop announcement copy
      → Maria Sanchez  ·  2 hours ago  ·  [VIEWED]
      Note: "I trust your voice on this one — our style guide is in the wiki"
      [ Recall ]

  ⏳  Order supplies for the workshop
      → David Park  ·  3 days ago  ·  [ACCEPTED]
      [ View Task ]
```

Status badges reflect the delegation state machine (`PENDING`, `VIEWED`, `ACCEPTED`, `COMPLETED`, `DECLINED`).

---

## 7. UI — Receiving a Delegation

### 7.1 Notification

The recipient sees an in-app notification:

```
🔔  Jason delegated a task to you:
    "Draft the tango workshop announcement copy"
    Note: "I trust your voice on this one — our style guide is in the wiki"

    [ View Task ]
```

### 7.2 Inbox Landing (default)

If `landingZone = INBOX`, the task appears as a special inbox item:

```
Inbox
  ┌─────────────────────────────────────────────────────────────┐
  │  📨  Delegated by Jason Courtemanche                        │
  │  "Draft the tango workshop announcement copy"               │
  │                                                             │
  │  "I trust your voice on this one — our style guide is in   │
  │   the wiki"                                                 │
  │                                                             │
  │  [ Accept & Process ]    [ Decline ]                        │
  └─────────────────────────────────────────────────────────────┘
```

**Accept & Process** launches the standard inbox processing wizard, pre-populated with the task title. The recipient can assign their own context, energy, time estimate, and project. When they confirm, the delegation status moves to `ACCEPTED` and the delegator is notified.

**Decline** presents a text field for an optional reason. On confirm, the task is returned to the delegator's inbox, the WaitingFor record is closed, and the delegator is notified.

### 7.3 Do Now Landing

If `landingZone = DO_NOW`, the task bypasses the inbox and appears immediately in the recipient's context-filtered next actions with `isNextAction: true`. A banner on the task card identifies its origin:

```
☐  Draft the tango workshop announcement copy
   └ 📨 Delegated by Jason  ·  @computer  ·  45min  ·  High energy
```

The recipient can still decline from the task detail view.

### 7.4 Completion Notifies Delegator

When the recipient marks the task complete, the delegator receives a notification:

```
🔔  Maria completed your delegated task:
    "Draft the tango workshop announcement copy"
    [ View ]
```

The WaitingFor record is automatically resolved (marked as `isResolved: true`).

---

## 8. API Endpoints

```
Delegation lifecycle:
  POST   /api/delegations                        Create delegation (send task)
  GET    /api/delegations?direction=given         My delegated-out tasks (Waiting For)
  GET    /api/delegations?direction=received      Tasks delegated to me
  PATCH  /api/delegations/:id/accept             Recipient accepts
  PATCH  /api/delegations/:id/decline            Recipient declines (body: { reason? })
  PATCH  /api/delegations/:id/recall             Delegator recalls (PENDING or VIEWED only)

User search for delegation:
  GET    /api/users/search?q=:query              Team-scoped user typeahead

Notifications:
  GET    /api/notifications                      Paginated list, unread first
  PATCH  /api/notifications/:id/read             Mark one read
  PATCH  /api/notifications/read-all             Mark all read
```

### 8.1 `POST /api/delegations` — Request Body

```typescript
{
  taskId:      string           // Existing task to delegate
  delegateeId: string           // userId of recipient
  landingZone: "INBOX" | "DO_NOW"  // default: "INBOX"
  note?:       string           // Optional message to recipient
}
```

**Response:**
```typescript
{
  delegation:  Delegation
  waitingFor:  WaitingFor       // auto-created
  notification: Notification    // created for recipient
}
```

### 8.2 `PATCH /api/delegations/:id/accept` — Accept Flow

No body required. Server:
1. Sets `delegation.status = ACCEPTED`, `respondedAt = now()`
2. Sets `task.userId = delegatee.id` (recipient takes ownership)
3. If `landingZone = DO_NOW`: sets `task.isNextAction = true`
4. If `landingZone = INBOX`: creates an `InboxItem` for the recipient pre-linked to the task
5. Creates `DELEGATION_ACCEPTED` notification for delegator

---

## 9. Cascade Engine Interaction

When a delegated task is part of a **sequential project** owned by the delegator:

- The task is treated as **blocked** from the cascade engine's perspective while `delegation.status` is `PENDING`, `VIEWED`, or `ACCEPTED`
- The next task in sequence does **not** unlock until the delegated task reaches `COMPLETED` or `DECLINED`
- On `DECLINED`, the task is returned to the delegator as-is and the cascade engine treats it as unblocked for the delegator

This ensures sequential project integrity is not broken by mid-project handoffs.

---

## 10. Weekly Review Integration

The existing Weekly Review "Team Awareness" section gains a **Delegated Tasks** sub-step:

```
Get Current — Delegated Tasks

  ⏳ Maria Sanchez
     "Draft the tango workshop announcement copy" — VIEWED, 4 days ago
     → Follow up? Recall?

  ✅ David Park
     "Order supplies for the workshop" — COMPLETED yesterday
     (WaitingFor auto-resolved)

  Any delegations to clean up or add?
```

The review step surfaces long-stale pending delegations (e.g., `PENDING` or `VIEWED` for > 7 days) with a follow-up prompt.

---

## 11. Open Questions — Resolved

**Q: Should the delegator or recipient control where the task lands?**
A: Delegator controls via `landingZone`. They know whether the task is urgent enough for Do Now. Recipient can always move it.

**Q: Should a team membership be required to delegate?**
A: Yes — user search is scoped to shared team members only. This prevents spam and keeps delegation within trusted relationships.

**Q: What happens to task ownership after acceptance?**
A: `task.userId` transfers to the recipient on accept. This means the task fully lives in their system. The delegator tracks it via the Delegation/WaitingFor record, not by retaining ownership of the task itself.

**Q: Can a recipient re-delegate a task they received?**
A: Not in v1. The delegate action is disabled on tasks where `delegation` is present. Re-delegation creates too much chain complexity for the initial release.

**Q: What happens to in-progress delegations if a user leaves a team?**
A: Team membership removal does not auto-recall delegations. Existing delegations continue to completion or until manually recalled. No new delegations can be sent to the removed user.

---

## 12. Out of Scope (Future)

- Re-delegation (chained handoffs)
- Bulk delegation (delegate multiple tasks at once)
- Delegation templates ("always delegate @errands tasks to X")
- Cross-server delegation (Federation spec)
- Delegation expiry / auto-recall after N days (can be revisited once usage patterns are established)

---

## 13. Roadmap Placement

This feature is a **v1.2 addition**, following the flat Teams release in v1.1. It depends on:
- Team membership model (for user search scoping)
- Notification model (new — this spec defines it)

Implementation order within this spec:
1. Schema migrations (Delegation, Notification models; WaitingFor additions)
2. `/api/delegations` and `/api/users/search` endpoints
3. `/api/notifications` endpoints
4. Inbox processing wizard upgrade (UI — delegation picker)
5. Task detail Delegate action (UI)
6. Recipient inbox item + Do Now landing (UI)
7. Waiting For view — delegation status badges + Recall (UI)
8. Notification panel (UI)
9. Weekly Review integration
10. Cascade engine guard (sequential project integrity)
