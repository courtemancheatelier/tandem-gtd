# Event RSVP & Coordination

**Spec version:** 1.0  
**Status:** Draft  
**Target release:** v1.3  
**Depends on:** TEAMS.md (invitation infrastructure, role-based access)

---

## 1. Overview

### 1.1 The Problem

Coordinating any group event — a wedding, Thanksgiving, a camping trip, a birthday party — involves two problems that currently have no home in Tandem:

1. **Collecting structured responses from guests** (who's coming, what they're eating, what they're bringing)
2. **Translating those responses into project work** (confirm headcount with the caterer, follow up with non-responders, finalize the bring list)

Today this lives in a spreadsheet, a Google Form, or a pile of text messages. None of those surfaces connect to the actual planning work.

### 1.2 The Solution

An **Event** is a first-class object in Tandem — similar to a Project, but with a guest list, configurable response fields, a lock date, and a live response dashboard. Events are linked to a Project so that response data (headcount, dietary needs, bring list status) automatically drives task availability through the cascade engine.

### 1.3 Universal Pattern

The same feature serves every use case. The organizer configures which fields matter for their event:

| Event type | Typical fields |
|---|---|
| Wedding | Attending, meal choice, dietary restrictions |
| Thanksgiving | Attending, dish to bring, headcount per household |
| Camping trip | Attending, carpooling, tent capacity, dietary needs |
| Birthday party | Attending, RSVP count, what to bring |
| Volunteer shift | Attending, role preference, t-shirt size |

The engine is the same. The fields are configured per event.

---

## 2. Core Concepts

### 2.1 The Event Object

An Event has:

- **Title** and optional description
- **Event date** — the actual occasion
- **RSVP lock date** — after this, responses are frozen and cascade triggers fire
- **Guest list** — invited users (authenticated; invited by email)
- **Response fields** — organizer-configured (see §3)
- **Linked project** — the planning project this Event belongs to
- **Response dashboard** — live view of all guest responses

### 2.2 Authenticated Guests Only

There are no anonymous RSVPs. Every guest authenticates before responding. This is not a restriction — it's what makes the feature useful:

- The organizer knows exactly who responded and who hasn't
- Guests can update their response before the lock date
- The organizer can assign tasks to guests (delegate "pick up the cake" to a specific bridesmaid)
- Email reminders go to real accounts, not unverified addresses
- Guests who authenticate become members of the linked team, with access scoped to their role

### 2.3 Role-Gated Project Access

When a guest accepts their invitation and authenticates, they are assigned a role. The role controls which projects within the team they can see.

Example: Wedding team roles
- **Couple** — sees everything
- **Bridesmaid** — sees bridesmaid prep project, bachelorette planning, dress coordination
- **Groomsman** — sees groomsmen tasks, bachelor party planning
- **Family** — sees ceremony logistics, accommodation info
- **Guest** — sees only their personal RSVP; no planning projects

This is an extension of the Teams invitation flow. The Event invitation is the onboarding path into the team.

### 2.4 The Lock Date as a Cascade Trigger

The RSVP lock date is not just a deadline — it is an event that fires cascade actions:

- "Confirm final headcount with caterer" → unlocks when lock date passes
- "Compile dietary requirements" → unlocks when lock date passes AND at least one dietary restriction was flagged
- "Follow up with non-responders" → unlocks if any invited guests have not responded by 3 days before lock date
- "Claim unclaimed bring-list items" → task created per unclaimed item after lock date

These cascade triggers are configurable per event template (see §6).

---

## 3. Response Fields

### 3.1 Field Types

Organizers build the response form from these field types:

| Field type | Description | Example |
|---|---|---|
| `attendance` | Required on all events. Yes / No / Maybe | "Will you attend?" |
| `headcount` | Integer — how many people in their party | "How many guests are you bringing?" |
| `single_select` | Choose one from a list | "Meal choice: Chicken / Fish / Vegetarian" |
| `multi_select` | Choose one or more from a list | "Dietary restrictions: Gluten-free / Nut allergy / Vegan" |
| `claim` | Claim one item from a shared needs list | "What are you bringing? (choose one)" |
| `text` | Short freeform response | "Any notes for us?" |
| `toggle` | Boolean flag | "Will you need a ride?" |

### 3.2 The Claim Field (Bring List)

The `claim` field represents a shared pool of needed items where each item can only be claimed once. When a guest claims an item, it is removed from the available pool for other guests.

Example — Thanksgiving bring list:
```
Available to claim:
  [ ] Rolls (2 dozen)
  [~] Green bean casserole  — being selected...
  [ ] Cranberry sauce
  [✓] Pie — claimed by Sarah
  [✓] Wine (2 bottles) — claimed by Marcus
```

Unclaimed items after the lock date automatically generate tasks for the organizer:
- "Nobody signed up to bring rolls — decide how to handle"

#### Concurrency: Soft Lock + Hard Claim

Two guests may have the RSVP form open simultaneously. The claim field uses a two-phase model to prevent conflicts without blocking either user:

**Phase 1 — Soft lock (selection):**
- When a guest selects an item, it is immediately soft-locked to that user
- All other active sessions see the item grayed out with a "being selected" indicator within ~5–10 seconds (polling-based refresh)
- Other guests cannot select a soft-locked item
- The soft lock does NOT persist until the guest saves their response

**Phase 2 — Hard claim (save):**
- When the guest submits their response, the soft lock converts to a hard claim
- The item is permanently removed from the available pool
- All sessions update to show it as claimed with the guest's name

**Soft lock release:**
- If the guest unselects the item, the soft lock releases immediately
- If the guest closes the page or is inactive for **15 minutes**, the soft lock expires automatically
- A warning is shown to the guest at the 13-minute mark: "Your selection will expire in 2 minutes — save your response to keep it"
- On expiry, the item returns to the available pool with no action required

**Implementation note:** The RSVP page polls the server every 5–10 seconds to refresh claim availability. Polling starts when the page mounts and stops automatically when the user navigates away, closes the tab, or the component unmounts — so there is zero ongoing server load once a guest is done. The Page Visibility API should additionally pause polling when the tab is backgrounded. This is the only surface in Tandem that requires this behavior. WebSocket infrastructure is not required for v1 — polling is an acceptable tradeoff given the low session concurrency expected on a typical event's RSVP page.

**Soft lock schema addition:**
```prisma
model ClaimLock {
  id        String   @id @default(cuid())
  eventId   String   @map("event_id")
  fieldId   String   @map("field_id")
  optionKey String   @map("option_key")  // the specific item being held
  userId    String   @map("user_id")
  expiresAt DateTime @map("expires_at")  // now + 15 minutes, refreshed on activity

  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([fieldId, optionKey])  // only one soft lock per item at a time
  @@index([expiresAt])            // for cron cleanup of expired locks
  @@map("claim_locks")
}
```

A lightweight cron job (or on-demand cleanup at read time) removes expired `ClaimLock` rows.

### 3.3 Field Visibility

Fields can be marked:
- **Required** — guest cannot submit without answering
- **Optional** — guest can skip
- **Organizer only** — not shown to guests (internal notes field, e.g. "table assignment")

### 3.4 Lock Behavior

After the lock date:
- Guests cannot change their responses
- The response dashboard freezes
- Cascade triggers fire (see §2.4)
- The organizer can still manually edit individual responses (e.g., a late dietary update phoned in)

---

## 4. Guest Experience

### 4.1 Invitation Flow

1. Organizer invites guest by email from within the Event
2. Guest receives email: "You're invited to [Event Name] — RSVP by [lock date]"
3. Guest clicks link → lands on authentication page
4. Guest creates account (or signs in if they already have one)
5. Guest is taken directly to their RSVP form
6. Guest submits response
7. Guest now has access to the team with role-scoped project visibility

### 4.2 RSVP Form

The guest sees a clean, focused form — not the full Tandem UI. Just the event name, date, and the configured response fields. Mobile-first design. Should feel like a nice wedding website form, not a task manager.

After submitting, guests see a confirmation screen and optionally a summary of what they responded.

### 4.3 Response Updates

Until the lock date, guests can return to their RSVP link and update their response. Each update is logged with a timestamp (organizer can see the history).

### 4.4 Reminders

Automated reminders are sent to guests who have not responded:
- Configurable schedule (e.g., 2 weeks before lock, 3 days before lock)
- Uses the existing Web Push / email notification infrastructure
- Organizer can also manually trigger a reminder to all non-responders from the dashboard

---

## 5. Organizer Dashboard

### 5.1 Response Summary

The live dashboard shows:

```
Guest Responses — 18 of 24 responded

Attending:     14  ██████████████░░░░░░  
Not attending:  3  ███░░░░░░░░░░░░░░░░░  
Maybe:          1  █░░░░░░░░░░░░░░░░░░░  
No response:    6  ██████░░░░░░░░░░░░░░  

Meal choices:
  Chicken:     8
  Fish:        4
  Vegetarian:  2

Dietary flags:
  Gluten-free: 3
  Nut allergy: 1
```

### 5.2 Guest Table

Full table view showing each invited guest, their response status, and each field's value. Sortable and filterable. Organizer can click any row to view or manually edit that guest's response.

### 5.3 Bring List Status

When a `claim` field is configured, a bring list panel shows:

```
Bring List
  [✓] Rolls (2 dozen)        — Sarah M.
  [✓] Wine (2 bottles)       — Marcus T.
  [ ] Green bean casserole   — UNCLAIMED
  [ ] Cranberry sauce        — UNCLAIMED
```

Unclaimed items are highlighted. Organizer can manually assign them or let the cascade engine generate a follow-up task.

### 5.4 Export

The organizer can export the full response table as CSV. This is a pragmatic concession — some vendors (caterers, venues) will want a spreadsheet, and Tandem should make that frictionless.

---

## 6. Cascade Integration

### 6.1 Standard Trigger Tasks

These task templates are attached to an Event and fire automatically based on response data:

| Trigger condition | Task generated |
|---|---|
| Lock date passes | "Confirm final headcount with [linked contact or vendor]" |
| Lock date passes + dietary flags present | "Compile dietary restrictions and send to caterer" |
| Guest has not responded 3 days before lock date | "Follow up with non-responders" (Waiting For per guest) |
| Unclaimed bring-list item after lock date | "Arrange [item name] — nobody signed up" |
| All claim items claimed | "Bring list complete — no action needed" (closes the tracker) |

### 6.2 Custom Trigger Tasks

Organizers can add their own trigger tasks in the event settings. Each trigger task has:
- A condition (lock date passed / headcount above threshold / specific field value)
- A task title
- An optional assignee (auto-assign to a specific team member)

### 6.3 Headcount-Driven Tasks

If a `headcount` field is configured, the total confirmed headcount is available as a variable in task titles and notes:

- "Submit final guest count ({{confirmed_headcount}}) to venue"
- "Order {{confirmed_headcount}} place settings"

This prevents the organizer from having to manually copy numbers from the dashboard into task notes.

---

## 7. Data Model

### 7.1 New Models

```prisma
model Event {
  id          String      @id @default(cuid())
  title       String
  description String?
  eventDate   DateTime    @map("event_date")
  lockDate    DateTime    @map("lock_date")
  isLocked    Boolean     @default(false) @map("is_locked")

  // Linked project and team
  projectId   String      @map("project_id")
  project     Project     @relation(fields: [projectId], references: [id])
  teamId      String?     @map("team_id")
  team        Team?       @relation(fields: [teamId], references: [id])

  // Organizer
  ownerId     String      @map("owner_id")
  owner       User        @relation(fields: [ownerId], references: [id])

  // Config
  fields      EventField[]
  invitations EventInvitation[]
  responses   EventResponse[]
  triggers    EventTrigger[]

  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt      @map("updated_at")

  @@index([projectId])
  @@index([ownerId])
  @@map("events")
}

model EventField {
  id          String          @id @default(cuid())
  eventId     String          @map("event_id")
  event       Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)

  type        EventFieldType
  label       String
  isRequired  Boolean         @default(false) @map("is_required")
  isOrgOnly   Boolean         @default(false) @map("is_org_only")
  sortOrder   Int             @default(0)     @map("sort_order")
  options     Json?           // Array of strings for single_select / multi_select / claim

  @@index([eventId])
  @@map("event_fields")
}

model EventInvitation {
  id          String              @id @default(cuid())
  eventId     String              @map("event_id")
  event       Event               @relation(fields: [eventId], references: [id], onDelete: Cascade)

  email       String
  role        String?             // maps to team role on acceptance
  token       String              @unique   // invite link token
  status      InvitationStatus    @default(PENDING)
  userId      String?             @map("user_id")
  user        User?               @relation(fields: [userId], references: [id])

  sentAt      DateTime            @default(now())  @map("sent_at")
  acceptedAt  DateTime?           @map("accepted_at")

  @@index([eventId])
  @@index([token])
  @@map("event_invitations")
}

model EventResponse {
  id          String    @id @default(cuid())
  eventId     String    @map("event_id")
  event       Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId      String    @map("user_id")
  user        User      @relation(fields: [userId], references: [id])

  attendance  AttendanceStatus
  fieldValues Json      @map("field_values")  // { fieldId: value } map
  submittedAt DateTime  @default(now())       @map("submitted_at")
  updatedAt   DateTime  @updatedAt            @map("updated_at")

  @@unique([eventId, userId])
  @@index([eventId])
  @@map("event_responses")
}

model EventTrigger {
  id          String    @id @default(cuid())
  eventId     String    @map("event_id")
  event       Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)

  condition   String    // "lock_date" | "dietary_flag" | "unclaimed_item" | "no_response"
  taskTitle   String    @map("task_title")
  assigneeId  String?   @map("assignee_id")
  fired       Boolean   @default(false)
  firedAt     DateTime? @map("fired_at")

  @@index([eventId])
  @@map("event_triggers")
}

enum EventFieldType {
  ATTENDANCE
  HEADCOUNT
  SINGLE_SELECT
  MULTI_SELECT
  CLAIM
  TEXT
  TOGGLE
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  DECLINED
}

enum AttendanceStatus {
  YES
  NO
  MAYBE
}
```

### 7.2 Modified Models

**Project** gains an optional Event relation:
```prisma
model Project {
  // ... existing fields ...
  event   Event?
}
```

**User** gains event relations:
```prisma
model User {
  // ... existing fields ...
  eventInvitations  EventInvitation[]
  eventResponses    EventResponse[]
}
```

---

## 8. API Surface

```
Events:
  POST   /api/events                      Create event
  GET    /api/events/:id                  Event detail + dashboard data
  PATCH  /api/events/:id                  Update event settings
  DELETE /api/events/:id                  Delete event
  POST   /api/events/:id/lock             Manually trigger lock + cascade

Fields:
  POST   /api/events/:id/fields           Add field
  PATCH  /api/events/:id/fields/:fid      Update field
  DELETE /api/events/:id/fields/:fid      Remove field
  PATCH  /api/events/:id/fields/reorder   Reorder fields

Invitations:
  POST   /api/events/:id/invitations      Invite guest(s) by email
  DELETE /api/events/:id/invitations/:iid Revoke invitation
  POST   /api/events/:id/reminders        Send reminder to non-responders

Responses (organizer):
  GET    /api/events/:id/responses        All responses (table data)
  PATCH  /api/events/:id/responses/:uid   Manually edit a guest's response
  GET    /api/events/:id/responses/export CSV export

Responses (guest — public with token):
  GET    /api/rsvp/:token                 Load RSVP form for guest
  POST   /api/rsvp/:token                 Submit or update response
```

---

## 9. UI

### 9.1 Event Creation

Events are created from within a project: "Add Event" button in the project header. A setup wizard walks the organizer through:

1. Event name, date, and lock date
2. Field builder — add/remove/reorder response fields
3. Guest list — paste or type email addresses, assign roles
4. Review and send invitations

### 9.2 RSVP Page

A purpose-built public-facing page at `/rsvp/[token]`. Design priority: feels like a thoughtful event website, not a productivity tool. Clean, warm, mobile-first. Shows event name, date, and the response form. After submission, confirmation screen with a summary.

### 9.3 Dashboard Tab

The linked project gains an "Event" tab in addition to its existing task views. The tab shows the response summary (§5.1), guest table (§5.2), bring list (§5.3 if applicable), and a "Send Reminders" button.

### 9.4 Locked State

After the lock date, the dashboard tab shows a banner: "Responses locked on [date] — [N] confirmed attending." The guest table becomes read-only (except for organizer manual edits). Cascade-triggered tasks appear in the project task list.

---

## 10. Event Templates

Three templates ship with this feature. Each pre-configures fields, trigger tasks, and suggested project phases.

See companion specs:
- `TEMPLATE_WEDDING.md`
- `TEMPLATE_THANKSGIVING.md`  
- `TEMPLATE_BIRTHDAY.md`

Templates are user-selectable when creating a new Event. Custom events can also be created from scratch.

---

## 11. Design Decisions

These questions have been resolved. Decisions are final for v1.

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | RSVP page branding | **Lightly branded** — small "Powered by Tandem" footer | Tandem gets visibility without intruding on the event experience. Organic discovery surface. |
| 2 | Household responses | **Deferred to v2** — one response per authenticated user in v1 | Simplifies the data model significantly. Edge cases (parent RSVPing for household) handled manually by organizer. |
| 3 | Unclaimed bring-list items | **Unassigned task** — organizer decides who handles it | Auto-assigning to the organizer feels presumptuous. They may want to delegate or handle it differently each time. |
| 4 | Lock date enforcement | **Hard cutoff, server-side** | Cascade triggers depend on a clean lock moment. Organizer retains manual edit ability after lock for late changes phoned in. |
| 5 | Guest response visibility | **Bring list claims are public to guests; all other responses are private** | Guests need to see what's claimed to avoid duplicates. Attendance and dietary data belongs only to the organizer. |
| 6 | Headcount variable resolution | **Resolved at lock date when task is created** | Prevents confusion if organizer manually edits a response after lock. The number in the task title is a snapshot. |
| 7 | Guest list size limit | **Soft cap at 200 with warning** | Protects against email blast abuse on managed hosting. Self-hosters can override via server config. |

---

## 12. Roadmap Placement

**v1.3** — Event RSVP & Coordination (this spec)  
Depends on Teams (v1.1) invitation infrastructure being stable.

**v2.0** — Potential extensions:
- Household responses (one account, multiple attendees)
- Custom email invitation design (organizer branding)
- Public event page with countdown
- Integration with calendar sync (Google Calendar event for guests)
- QR code check-in on event day
