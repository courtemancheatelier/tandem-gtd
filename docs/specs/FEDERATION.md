# Tandem — Cross-Instance Federation Spec

**Date:** February 26, 2026
**Extends:** TEAMS.md, TANDEM_SPEC.md §12.3 (Group Hosting), TANDEM_AI_INTEGRATION.md
**Status:** Draft for review
**Depends on:** Import/Export feature (in progress)

---

## Overview

Federation lets two or more standalone Tandem instances collaborate as if they were on the same server — shared projects, task delegation, waiting-for tracking — while each person keeps their own database, their own backups, and their own server. Nobody's GTD data lives on someone else's machine.

### The Problem

The current team model requires all collaborators to have accounts on the same Tandem server. This works great for the friend-group-on-bare-metal scenario, but breaks down when:

- Two people each migrated from beta to their own standalone instances and still want to collaborate
- Privacy-conscious users want shared projects but don't want their entire GTD system on someone else's hardware
- A small team wants the operational independence of separate servers with the collaboration of shared projects
- Someone's server goes down — their collaborators shouldn't lose access to their own tasks

### The Principle

**Federation is shared projects over HTTPS, not shared databases.** Each instance remains fully sovereign. Collaboration data flows between instances on a need-to-know basis — you see the team project and its tasks, but nothing about your collaborator's personal projects, inbox, horizons, or weekly review.

### What Gets Federated

| Federated (shared between instances) | NOT Federated (stays local) |
|---------------------------------------|------------------------------|
| Team membership and roles | Personal projects and tasks |
| Team projects and their tasks | Inbox items |
| Task assignments and delegation | Contexts (mapped locally) |
| Waiting-for items from federated tasks | Horizons of Focus |
| Task completion/status changes | Weekly Review state |
| Wiki articles in team-scoped wikis | Goals and Areas |
| Project cascade events | Personal wiki articles |

---

## 1. Identity & Discovery

### 1.1 Instance Identity

Each Tandem instance has a unique identity derived from its public URL. When federation is enabled, the instance generates a keypair for signing requests.

```
Instance ID:    tandem.jason.dev        (the canonical hostname)
Public Key:     Ed25519 key for request signing
Federation URL: https://tandem.jason.dev/api/federation/
```

**Schema additions:**

```prisma
/// This instance's federation identity. Exactly one row.
model FederationIdentity {
  id              String   @id @default(cuid())
  hostname        String   @unique              // "tandem.jason.dev"
  publicKey       String   @map("public_key")   // Ed25519 public key (base64)
  privateKey      String   @map("private_key")  // Ed25519 private key (encrypted at rest)
  federationEnabled Boolean @default(false) @map("federation_enabled")
  createdAt       DateTime @default(now()) @map("created_at")

  @@map("federation_identity")
}
```

### 1.2 User Identity (Federated)

Users are identified across instances by their `username@hostname` — same pattern as email, Matrix, and ActivityPub. This avoids collisions without requiring a central registry.

```
jason@tandem.jason.dev
mike@tandem.mike.io
sarah@gtd.sarahsmith.com
```

The local `User` model gains a federated identity field:

```prisma
model User {
  // ... existing fields ...

  // Federation identity
  federatedId     String?  @unique @map("federated_id")  // "jason@tandem.jason.dev"
}
```

When federation is enabled, existing users are prompted to confirm their federated ID (defaulting to `username@hostname`). This is a one-time setup.

### 1.3 Remote User Records

When a remote user participates in a local team project, a lightweight "shadow" record represents them locally:

```prisma
/// A user on a remote Tandem instance, cached locally for team membership.
model RemoteUser {
  id              String   @id @default(cuid())
  federatedId     String   @unique @map("federated_id")  // "mike@tandem.mike.io"
  displayName     String   @map("display_name")
  instanceHost    String   @map("instance_host")          // "tandem.mike.io"
  publicKey       String?  @map("public_key")             // For verifying their actions
  lastSeen        DateTime @default(now()) @map("last_seen")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  // Relations — remote users can be team members and have tasks assigned
  teamMemberships FederatedTeamMember[]
  assignedTasks   Task[]   @relation("RemoteAssignee")

  @@index([instanceHost])
  @@map("remote_users")
}
```

### 1.4 Discovery & Pairing

Two instances connect through a **mutual pairing flow** — no instance can push data to another without prior consent from both sides.

```
┌──────────────────┐          ┌──────────────────┐
│  Jason's Server   │          │  Mike's Server    │
│  tandem.jason.dev │          │  tandem.mike.io   │
└────────┬─────────┘          └────────┬──────────┘
         │                              │
         │  1. Jason initiates:         │
         │  POST /api/federation/pair   │
         │  { hostname, publicKey,      │
         │    inviteCode }              │
         │ ─────────────────────────── ▶│
         │                              │
         │  2. Mike reviews & accepts   │
         │     in Tandem UI             │
         │                              │
         │  3. Mike confirms:           │
         │◀ ─────────────────────────── │
         │  POST /api/federation/pair   │
         │  { hostname, publicKey,      │
         │    accepted: true }          │
         │                              │
         │  4. Both instances store     │
         │     each other as peers      │
         │                              │
         │  ✅ Paired — ready to        │
         │     create federated teams   │
```

**Pairing is invite-code-based**, similar to how the existing team invite flow works:

1. Jason generates a pairing invite in Tandem UI → gets a short code (e.g., `TANDEM-7K9X-M2PL`)
2. Jason shares the code with Mike (text, email, in person — out-of-band)
3. Mike enters the code + Jason's instance URL in his Tandem UI
4. Mike's server calls Jason's `/api/federation/pair` endpoint with the code
5. Jason's server validates the code and returns its public key
6. Mike's server sends back its public key → both store each other as trusted peers

```prisma
/// A paired remote Tandem instance.
model FederatedPeer {
  id              String   @id @default(cuid())
  hostname        String   @unique               // "tandem.mike.io"
  displayName     String?  @map("display_name")  // Human-friendly name for the UI
  publicKey       String   @map("public_key")    // Their Ed25519 public key
  federationUrl   String   @map("federation_url") // "https://tandem.mike.io/api/federation/"
  status          PeerStatus @default(ACTIVE)
  pairedAt        DateTime @default(now()) @map("paired_at")
  lastSync        DateTime? @map("last_sync")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  // Relations
  remoteTeams     FederatedTeamLink[]

  @@map("federated_peers")
}

enum PeerStatus {
  PENDING    // Invite sent, not yet accepted
  ACTIVE     // Paired and syncing
  SUSPENDED  // Temporarily paused (manual or due to errors)
  REVOKED    // Permanently disconnected
}
```

---

## 2. Federated Teams

### 2.1 Design Decision: Federated Teams vs. Federated Projects

**Chosen approach: Federate at the team level, not the project level.**

Rationale: The existing team model already handles "a group of people with shared projects." Federation extends this by allowing team members to live on different instances. This keeps the mental model consistent — you're still joining a team and seeing its projects — and avoids the complexity of ad-hoc per-project federation.

A federated team has a **home instance** (where the team was created and the canonical data lives) and **member instances** (where remote members receive replicated project/task data).

### 2.2 Data Model

```prisma
/// Links a local team to its federated representation.
/// On the HOME instance: the team was created here; we are the source of truth.
/// On a MEMBER instance: we received this team via federation; home instance is source of truth.
model FederatedTeamLink {
  id              String   @id @default(cuid())
  teamId          String   @map("team_id")        // Local Team record
  team            Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  role            FederatedTeamRole                // HOME or MEMBER
  homeInstanceHost String  @map("home_instance_host") // Where the team was created
  peerId          String?  @map("peer_id")         // FederatedPeer for remote instances
  peer            FederatedPeer? @relation(fields: [peerId], references: [id])
  syncCursor      String?  @map("sync_cursor")     // Last processed event ID for sync
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([teamId])
  @@map("federated_team_links")
}

enum FederatedTeamRole {
  HOME    // This instance owns the team
  MEMBER  // This instance received the team via federation
}

/// Team membership for federated teams — extends TeamMember to track
/// which members are local vs remote.
model FederatedTeamMember {
  id              String   @id @default(cuid())
  teamId          String   @map("team_id")
  team            Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  // Exactly one of these is set:
  localUserId     String?  @map("local_user_id")
  localUser       User?    @relation(fields: [localUserId], references: [id])
  remoteUserId    String?  @map("remote_user_id")
  remoteUser      RemoteUser? @relation(fields: [remoteUserId], references: [id])

  federatedId     String   @map("federated_id")   // "jason@tandem.jason.dev"
  role            TeamRole @default(MEMBER)
  label           String?
  joinedAt        DateTime @default(now()) @map("joined_at")

  @@unique([teamId, federatedId])
  @@map("federated_team_members")
}
```

### 2.3 Creating a Federated Team

A federated team is created by a local user and then members from paired instances are invited:

```
Jason (on tandem.jason.dev):
  1. Creates team "Camping Crew" (normal team creation)
  2. Clicks [+ Invite from Paired Instance]
  3. Selects Mike's instance (tandem.mike.io)
  4. Selects Mike's federated ID (mike@tandem.mike.io)
  5. Sets role: MEMBER, label: "Camp Chef"

System:
  6. Creates local FederatedTeamLink (role: HOME)
  7. Sends federation invite to tandem.mike.io:
     POST https://tandem.mike.io/api/federation/teams/invite
     {
       teamId: "camping-crew-id",
       teamName: "Camping Crew",
       inviterFederatedId: "jason@tandem.jason.dev",
       inviteeFederatedId: "mike@tandem.mike.io",
       role: "MEMBER",
       label: "Camp Chef",
       homeInstance: "tandem.jason.dev"
     }

Mike (on tandem.mike.io):
  8. Sees notification: "Jason invited you to Camping Crew"
  9. Accepts → Mike's instance creates:
     - Local Team record (mirroring the remote team)
     - FederatedTeamLink (role: MEMBER, homeInstanceHost: tandem.jason.dev)
     - FederatedTeamMember entries for all members
  10. Sends acceptance back to Jason's instance
  11. Initial sync begins — all existing team projects & tasks replicate to Mike
```

### 2.4 How Existing Team Features Map

| Feature | Same-Server Team | Federated Team |
|---------|-----------------|----------------|
| Team CRUD | Direct DB operations | Home instance is source of truth; changes push to members |
| Add member (local) | TeamMember insert | FederatedTeamMember + local TeamMember |
| Add member (remote) | N/A | Federation invite flow |
| Create project | Direct insert | Created on home instance, replicated to member instances |
| Assign task | Direct update | Update on home instance, pushed to assignee's instance |
| Complete task | Cascade engine fires locally | Completion pushed to home instance → cascade fires → results pushed back |
| "What Should I Do Now?" | Unified query across all projects | Includes replicated federated tasks (filtered to assigned/unassigned) |
| Weekly Review | Shows team projects inline | Includes replicated federated projects |
| Waiting For | Auto-generated from assignments | Works identically — remote assignments create local waiting-for |

---

## 3. Sync Protocol

### 3.1 Architecture: Event-Sourced Replication

Tandem already uses event sourcing for task history (`TaskEvent`, `ProjectEvent`). Federation extends this — team-scoped events are the unit of replication between instances.

```
┌─────────────────────────────────────────┐
│  Home Instance (tandem.jason.dev)       │
│                                          │
│  Team Project "August Camping"           │
│  ┌──────────────────────────────┐       │
│  │ Event Log (source of truth)  │       │
│  │ evt-001: Task created        │       │
│  │ evt-002: Task assigned→Mike  │───────┼──▶ Push to tandem.mike.io
│  │ evt-003: Task status changed │       │
│  │ evt-004: Task completed      │───────┼──▶ Push to tandem.mike.io
│  └──────────────────────────────┘       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Member Instance (tandem.mike.io)       │
│                                          │
│  Replicated Project "August Camping"     │
│  ┌──────────────────────────────┐       │
│  │ Local replica (read+write)   │       │
│  │ Applies events from home     │       │
│  │ Sends local changes back     │───────┼──▶ Push to tandem.jason.dev
│  └──────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### 3.2 Federation Events

A new event type wraps team-scoped changes for replication:

```prisma
/// An event in the federation sync log. Each event represents a change
/// to a federated team, project, or task that must be replicated.
model FederationEvent {
  id              String   @id @default(cuid())
  teamId          String   @map("team_id")
  eventType       FederationEventType
  entityType      FederatedEntityType     // TEAM, PROJECT, TASK, MEMBER, WIKI
  entityId        String   @map("entity_id")
  payload         Json                     // The change data (entity snapshot or diff)
  actorFederatedId String  @map("actor_federated_id") // Who did this
  sourceInstance  String   @map("source_instance")     // Where it originated
  createdAt       DateTime @default(now()) @map("created_at")

  // Delivery tracking
  deliveries      FederationEventDelivery[]

  @@index([teamId, createdAt])
  @@index([sourceInstance])
  @@map("federation_events")
}

model FederationEventDelivery {
  id              String   @id @default(cuid())
  eventId         String   @map("event_id")
  event           FederationEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  targetHost      String   @map("target_host")
  status          DeliveryStatus @default(PENDING)
  attempts        Int      @default(0)
  lastAttempt     DateTime? @map("last_attempt")
  deliveredAt     DateTime? @map("delivered_at")
  errorMessage    String?  @map("error_message")

  @@unique([eventId, targetHost])
  @@index([status, lastAttempt])
  @@map("federation_event_deliveries")
}

enum FederationEventType {
  // Team lifecycle
  TEAM_UPDATED
  MEMBER_ADDED
  MEMBER_REMOVED
  MEMBER_ROLE_CHANGED

  // Project lifecycle
  PROJECT_CREATED
  PROJECT_UPDATED
  PROJECT_COMPLETED
  PROJECT_STATUS_CHANGED

  // Task lifecycle
  TASK_CREATED
  TASK_UPDATED
  TASK_ASSIGNED
  TASK_COMPLETED
  TASK_STATUS_CHANGED
  TASK_DELETED

  // Wiki
  WIKI_ARTICLE_CREATED
  WIKI_ARTICLE_UPDATED
  WIKI_ARTICLE_DELETED

  // Cascade results
  CASCADE_RESULT
}

enum FederatedEntityType {
  TEAM
  PROJECT
  TASK
  MEMBER
  WIKI_ARTICLE
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
  EXPIRED     // Gave up after max retries
}
```

### 3.3 Push-Based Sync with Pull Fallback

The primary sync mechanism is **push**: when a change happens on any instance, the originating instance immediately pushes the event to all other instances in the team.

**Push flow:**

```
1. User completes a task on their instance
2. Local cascade engine fires (same as non-federated)
3. FederationEvent is created for the team-scoped change
4. FederationEventDelivery records created for each peer in the team
5. Background job pushes events to each peer:
   POST https://peer.host/api/federation/events
   {
     events: [{ id, teamId, eventType, entityType, entityId, payload, actor, source, createdAt }],
     signature: Ed25519_sign(events, privateKey)
   }
6. Receiving instance validates signature, applies events, sends ACK
```

**Pull fallback** for missed events (network outage, server restart):

```
GET https://home.host/api/federation/events?teamId=X&after=last-cursor
```

Each member instance tracks a `syncCursor` per team — the ID of the last event it successfully processed. On startup or after a connectivity gap, it pulls any events it missed.

### 3.4 Sync Frequency & Batching

| Trigger | Behavior |
|---------|----------|
| Task/project change in federated team | Immediate push (debounced 500ms for rapid edits) |
| Instance startup | Pull missed events for all federated teams |
| Periodic heartbeat | Every 5 minutes, check for undelivered events and retry |
| Manual sync | User can trigger "Sync Now" from team settings |

**Retry strategy for failed deliveries:**

| Attempt | Delay | Notes |
|---------|-------|-------|
| 1 | Immediate | First try |
| 2 | 30 seconds | Quick retry |
| 3 | 5 minutes | |
| 4 | 30 minutes | |
| 5 | 2 hours | |
| 6 | 12 hours | |
| 7+ | 24 hours | Continues daily for 7 days, then marks EXPIRED |

After 7 days of failed delivery, the event is marked EXPIRED and the peer's status changes to SUSPENDED. The admin gets a notification. The peer can catch up via pull when connectivity resumes.

### 3.5 Conflict Resolution

**Strategy: Last-write-wins with operational awareness.**

Because federated teams have a home instance that serves as the source of truth, most operations flow through it. But two people might update the same task concurrently (e.g., both edit the title while offline).

**Rules:**

1. **Home instance is the arbiter.** When conflicting events arrive, the home instance resolves them by timestamp (latest wins) and broadcasts the resolution.
2. **Task assignment conflicts** (two people assign the same task to different people): home instance accepts whichever arrived first; the second gets a rejection event with reason.
3. **Task completion is idempotent.** If both instances report a task complete, the first is applied and the second is acknowledged as a no-op.
4. **Destructive operations require home instance.** Deleting tasks/projects can only originate from the home instance (admin action). Member instances can mark tasks as dropped (soft delete) but not hard delete.

**Optimistic local application:** Member instances apply changes locally first (for instant UI feedback), then push to home. If the home rejects or modifies the change, a correction event is sent back.

---

## 4. API Surface

### 4.1 Federation Endpoints (New)

All federation endpoints live under `/api/federation/` and require signed requests (Ed25519) from paired peers or valid pairing invite codes.

```
Identity & Pairing:
  GET    /api/federation/identity           Public info (hostname, publicKey, version)
  POST   /api/federation/pair               Initiate or confirm pairing
  DELETE /api/federation/peers/:host        Revoke a pairing

Team Federation:
  POST   /api/federation/teams/invite       Invite remote user to federated team
  POST   /api/federation/teams/accept       Accept team invitation
  POST   /api/federation/teams/leave        Leave a federated team
  GET    /api/federation/teams/:id/sync     Pull events (with cursor)

Event Replication:
  POST   /api/federation/events             Receive pushed events (batch)
  POST   /api/federation/events/ack         Acknowledge event delivery

User Discovery:
  GET    /api/federation/users/lookup       Look up user by federated ID
  GET    /api/federation/users/search       Search users on a paired instance (limited)
```

### 4.2 Modified Existing Endpoints

```
Teams:
  POST   /api/teams                    Now accepts federationEnabled flag
  POST   /api/teams/:id/members        Now supports remote user invitation
  GET    /api/teams/:id/members        Returns both local and remote members

Tasks:
  PATCH  /api/tasks/:id                Now triggers federation push if task is in federated team
  POST   /api/tasks/:id/complete       Cascade + federation push
```

### 4.3 Request Signing

All inter-instance requests are signed with the sending instance's Ed25519 private key. The receiving instance verifies against the stored public key from pairing.

```
Headers:
  X-Tandem-Instance: tandem.jason.dev
  X-Tandem-Timestamp: 2026-02-26T15:30:00Z
  X-Tandem-Signature: base64(Ed25519_sign(method + path + timestamp + body_hash, privateKey))
```

**Verification rules:**
- Timestamp must be within ±5 minutes of server time (prevents replay attacks)
- Instance must be a known, ACTIVE peer
- Signature must verify against the peer's stored public key

---

## 5. Security & Trust Model

### 5.1 Trust Levels

| Trust Level | What It Means | How Achieved |
|-------------|---------------|--------------|
| **Untrusted** | Unknown instance, no relationship | Default for all instances |
| **Paired** | Cryptographic keys exchanged, mutual consent | Pairing flow with invite code |
| **Team member** | Can see/edit specific team data | Team invitation + acceptance |
| **Team admin** | Can manage team structure | Role assignment by existing admin |

### 5.2 Data Minimization

Federation only replicates what's necessary for team collaboration:

**Included in replication payloads:**
- Task: title, notes, status, assignee, dueDate, energyLevel, estimatedMins, sortOrder, completedAt
- Project: title, description, status, type, outcome, sortOrder
- Team membership: federatedId, displayName, role, label
- Wiki articles: title, content, tags (team-scoped only)

**NEVER included in replication:**
- Passwords, auth tokens, or session data
- Personal projects, tasks, or inbox items
- Horizon notes, goals, areas
- Weekly review state
- Contexts (mapped locally — see §6.1)
- AI privacy settings
- User email addresses (only federatedId)

### 5.3 Encryption

| Layer | Protection |
|-------|-----------|
| Transport | TLS 1.3 (HTTPS required for federation) |
| Authentication | Ed25519 request signing |
| At rest | Each instance manages its own encryption |
| Payload | Not end-to-end encrypted (instances can read team data they host) |

**Note on E2EE:** End-to-end encryption of federated data is explicitly out of scope for v1. It would prevent the home instance from running cascade logic on task completions. A future version could explore E2EE for wiki articles and task notes where server-side processing isn't needed.

### 5.4 Revoking Access

When a peer is revoked or a remote member is removed:

1. All pending event deliveries to that peer are cancelled
2. The peer's public key is marked as revoked (reject future requests)
3. **Local replicated data is retained** (the admin can choose to delete it)
4. The remote instance receives a revocation event and removes access to team data
5. Tasks assigned to the removed member remain but become unassigned

---

## 6. Integration with Existing Features

### 6.1 Context Mapping

Contexts are personal — `@home`, `@computer`, `@errands` mean different things to different people, and they're user-specific in the database. Federated tasks arrive without contexts.

**Solution: Local context assignment.**

When a federated task is replicated to a member instance, it arrives without a `contextId`. The local user assigns their own context, just like any other task. This context is stored locally and not replicated back — it's a personal organizational choice.

The task's `contextId` on the home instance (set by whoever created the task) is stored in the federation event payload as a hint (`contextName: "@computer"`) so the receiving instance can suggest a matching local context, but it's never authoritative.

### 6.2 "What Should I Do Now?" Integration

Federated tasks appear in "What Should I Do Now?" identically to local team tasks. The query already filters by the current user's assigned tasks — federated tasks that are assigned to the local user or unassigned in teams they belong to show up automatically.

The only UI difference: federated tasks show a small instance indicator (e.g., a subtle icon or `via tandem.jason.dev`) so the user knows the task originated remotely.

### 6.3 Cascade Engine

The cascade engine on the **home instance** remains the source of truth for project-level cascades:

```
Mike completes a task on tandem.mike.io:
  1. Local: Task marked complete, local UI updates immediately
  2. Federation: TASK_COMPLETED event pushed to home instance (tandem.jason.dev)
  3. Home instance: Cascade engine fires
     - Next task in sequence promoted to isNextAction
     - If all tasks complete → project completed
     - If project linked to goal → goal progress updated
  4. Home instance: CASCADE_RESULT event(s) pushed to all member instances
  5. All instances: Apply cascade results (task promotions, project status changes)
```

This ensures cascade logic runs in one place (no split-brain) while still giving Mike instant feedback on his completion.

### 6.4 Weekly Review

The weekly review's "Get Current — Team Projects" section works identically with federated teams. The local replica of federated projects contains all the information needed:

- Which projects have next actions defined
- Which tasks are waiting on others
- How many days since last activity

The review doesn't need to contact the home instance in real-time — the replicated data is sufficient.

### 6.5 MCP Integration

The existing MCP tools (`tandem_task_list`, `tandem_project_list`, `tandem_team_list`, etc.) work transparently with federated data because it's stored in the same local models. A user saying "show me my tasks" via Claude gets both personal and federated team tasks.

The MCP tool `tandem_team_list` gains a `federated` field in its response indicating which teams are federated and their home instance.

### 6.6 Import/Export & Federation

The import/export system (in progress) and federation are complementary:

- **Export** produces a complete snapshot of one user's data, including their federated team memberships (but not the full team data — just enough to re-establish the connection)
- **Import** on a new instance restores personal data and attempts to re-pair with previous federated peers
- A user migrating from the beta to standalone can: export → import to new instance → re-establish federation with existing collaborators

---

## 7. UI Surface

### 7.1 Federation Settings (Admin)

```
Settings → Federation
┌────────────────────────────────────────────────────────┐
│  Federation                                     [On]   │
│                                                         │
│  Your Instance: tandem.jason.dev                       │
│  Your Federated ID: jason@tandem.jason.dev             │
│                                                         │
│  Paired Instances                                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  🟢 tandem.mike.io          Paired Feb 26, 2026  │  │
│  │     Last sync: 2 minutes ago                      │  │
│  │     Teams shared: 2                               │  │
│  │     [Sync Now]  [Suspend]  [Revoke]              │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  🟡 gtd.sarah.com           Paired Feb 20, 2026  │  │
│  │     Last sync: 3 hours ago (retrying)             │  │
│  │     Teams shared: 1                               │  │
│  │     [Sync Now]  [Suspend]  [Revoke]              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  [+ Pair New Instance]  [Generate Invite Code]         │
└────────────────────────────────────────────────────────┘
```

### 7.2 Team Member Invitation (Extended)

When inviting members to a team, the existing flow gains a new option:

```
[+ Invite Member]
  ├── Search local users (existing flow)
  ├── Invite by email (existing flow)
  ├── Copy invite link (existing flow)
  └── [NEW] Invite from paired instance
       → Select instance: [tandem.mike.io ▼]
       → Select user: [mike@tandem.mike.io ▼]
       → Role: [Member ▼]
       → Label: [Camp Chef          ]
       → [Send Invitation]
```

### 7.3 Federation Status Indicators

Throughout the UI, federated content is subtly distinguished:

- **Team list:** Federated teams show a small federation icon (🔗 or similar) and the home instance
- **Task list:** Tasks from federated teams show normally but with a hover tooltip showing the source instance
- **Team dashboard:** Shows sync status (last sync time, any pending events)
- **Waiting For:** Remote user names show their instance: `Mike (tandem.mike.io)`

### 7.4 Notification Center

Federation adds notification types:

| Notification | Trigger |
|-------------|---------|
| "Mike invited you to Camping Crew" | Federation team invite received |
| "Sarah accepted your team invitation" | Remote user accepted invite |
| "Sync issue with tandem.mike.io" | 3+ consecutive delivery failures |
| "Federation restored with gtd.sarah.com" | Peer recovered from SUSPENDED |
| "Task assigned to you: Plan meal schedule" | Remote assignment via federation |

---

## 8. Offline & Degraded Mode

### 8.1 Principle: Local-First, Sync-Second

Each instance is fully functional without connectivity to peers. Federated data that has been replicated locally continues to work — you can view projects, complete your assigned tasks, and see team status. Changes queue up as pending federation events and sync when connectivity resumes.

### 8.2 What Works Offline

| Feature | Offline Behavior |
|---------|-----------------|
| View federated team projects & tasks | ✅ Uses local replica |
| Complete assigned tasks | ✅ Queued for sync |
| Create tasks in federated projects | ✅ Queued for sync |
| Assign tasks to remote members | ✅ Queued (assignment applies on sync) |
| See cascade results | ⏳ Delayed until home instance processes |
| Weekly Review of team projects | ✅ Uses local replica (may be stale) |
| Invite new remote members | ❌ Requires connectivity |

### 8.3 Stale Data Indicators

When a federated team hasn't synced recently, the UI shows a warning:

```
⚠️ Last synced 3 hours ago — some changes may not be reflected.
   [Sync Now]
```

The threshold for showing this warning is configurable (default: 30 minutes for active teams).

---

## 9. Roadmap Placement

This feature set builds on the existing team infrastructure and the in-progress import/export work:

**v1.3 — Basic Federation**
- Instance identity generation (keypair)
- Pairing flow (invite code, mutual key exchange)
- Federated team creation and remote member invitation
- Push-based event replication for tasks and projects
- Pull-based catch-up on startup
- Context mapping for federated tasks
- Federation settings UI
- Cascade delegation to home instance

**v1.4 — Federation Maturity**
- Federated wiki articles (team-scoped)
- Advanced conflict resolution (beyond last-write-wins)
- Federation health dashboard (sync stats, event delivery metrics)
- Bulk re-sync (full team re-replication for recovery)
- Cross-instance search within federated teams
- Federation in weekly review (sync status awareness)
- Mobile push notifications for federation events (via existing calendar integration)

**v1.5 — Federation at Scale**
- Multi-hop federation (instance A ↔ B ↔ C, where A and C aren't directly paired)
- Federated team hierarchy (child teams across instances)
- Rate limiting and abuse prevention for federation endpoints
- Federation protocol versioning and backward compatibility
- Optional E2EE for wiki content and task notes

---

## 10. Migration Path

### 10.1 From Beta (Shared Server) to Federation

For users migrating from the beta to their own standalone instances:

```
Phase 1 — While still on beta:
  1. Each user exports their data (import/export feature)
  2. Admin exports team structures and shared projects

Phase 2 — On standalone instances:
  3. Each user imports their personal data to their new instance
  4. Each user enables federation and generates their federated ID
  5. Users pair their instances with each other

Phase 3 — Re-establishing teams:
  6. One user (the previous team admin) creates the federated team
  7. Invites the other members from their paired instances
  8. Shared project data is re-synced to all member instances
```

**The import/export feature should include a `federationHints` section** in the export format that captures:
- Previous team memberships and member federated IDs
- Shared project metadata (enough to match during re-federation)
- The user's preferred federated ID

This makes Phase 3 semi-automatic — the system can suggest "You were in a team called 'Camping Crew' with mike@tandem.mike.io. Want to re-create it?"

### 10.2 From Same-Server Teams to Federation

A team on a shared server can be "graduated" to federation if members want to split to their own instances:

1. Member sets up their own instance and pairs with the original server
2. Admin converts the team from local to federated (one-click)
3. The member's data migrates to their instance while the team link persists
4. Eventually, the original server can be decommissioned if all members have migrated

---

## 11. Technical Implementation Notes

### 11.1 Libraries & Dependencies

| Concern | Library | Notes |
|---------|---------|-------|
| Ed25519 signing | `@noble/ed25519` | Pure JS, no native deps, audited |
| HTTP client (instance-to-instance) | `undici` or Node `fetch` | Already available in Node 18+ |
| Job queue (event delivery) | `bullmq` + Redis, or `pg-boss` | pg-boss preferred (no Redis dependency, uses existing PostgreSQL) |
| Request validation | `zod` | Already in use |

### 11.2 Background Job Architecture

Federation requires reliable background job processing for event delivery:

```
pg-boss (PostgreSQL-backed job queue)
  ├── federation:push-events      Push pending events to peers (runs on change + every 5 min)
  ├── federation:pull-events      Pull missed events from home instances (runs on startup + hourly)
  ├── federation:retry-failed     Retry failed deliveries with backoff (runs every 5 min)
  ├── federation:heartbeat        Peer health check (runs every 5 min)
  └── federation:cleanup          Expire old delivered events (runs daily)
```

### 11.3 Database Indexes for Federation

```sql
-- Fast lookup of pending deliveries
CREATE INDEX idx_fed_delivery_pending
  ON federation_event_deliveries(status, last_attempt)
  WHERE status = 'PENDING' OR status = 'FAILED';

-- Fast event pull by team and cursor
CREATE INDEX idx_fed_events_team_cursor
  ON federation_events(team_id, created_at);

-- Fast peer lookup
CREATE INDEX idx_fed_peers_hostname
  ON federated_peers(hostname) WHERE status = 'ACTIVE';
```

### 11.4 Rate Limiting

Federation endpoints enforce rate limits per peer to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/federation/events` (push) | 1000 events | per minute |
| `/api/federation/events` (pull) | 60 requests | per minute |
| `/api/federation/pair` | 10 attempts | per hour |
| `/api/federation/users/search` | 30 requests | per minute |

---

## 12. Design Decisions (Resolved)

1. **Federated teams start with flat projects.** Sub-project hierarchy (from PM_FEATURES spec) is not replicated in v1.3. Sub-project replication lands in v1.4 once the base sync protocol is battle-tested.

2. **Recurring templates live on the home instance.** The home instance owns `RecurringTemplate` records for federated teams. When a template triggers, the generated tasks replicate to member instances through the normal event sync — no template duplication across instances.

3. **Gantt view works with federated projects.** Task dependencies and scheduling data replicate naturally as part of the task payload. The Gantt chart renders from local replica data. When the replica is stale (last sync > 30 minutes), a banner reads: `⚠️ Data may be stale — last synced [time ago]. [Sync Now]`. Critical path calculations use local data and are accurate to the last sync point.

4. **Team admin role is instance-agnostic.** A team admin on `tandem.mike.io` has the same team management powers as an admin on the home instance `tandem.jason.dev`. Home instance infrastructure admin (server settings, federation config) is a completely separate concept — that's the server owner, not the team admin. The two roles don't overlap.

5. **"Promote to home" operation for orphaned teams (v1.4).** If a home instance permanently dies, member instances retain their local replicas and continue functioning in read+write mode with changes queued. In v1.4, any remaining team admin can initiate a "promote to home" vote. All active member instances must acknowledge the promotion. The promoting instance becomes the new home, other members re-point their `FederatedTeamLink.homeInstanceHost`, and the sync cursor resets with a full re-sync from the new home's replica.
