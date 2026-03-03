# Tandem GTD — Closed Project Data Retention & Purge

**Status:** Draft  
**Author:** Jason Courtemanche / Courtemanche Atelier  
**Date:** 2026-03-01

---

## 1. Problem Statement

Completed and dropped projects accumulate indefinitely in the database. After ~6 months, this data is almost never revisited — and if it is needed, the appropriate GTD response is to create a new project rather than resurrect stale context. This dead weight increases backup sizes, slows queries that touch project/task tables, and creates noise in archive searches.

Tandem needs an automated data retention policy that purges closed project trees after a configurable period, keeping the database lean while giving users fair warning and an opportunity to export before deletion.

---

## 2. Terminology

| Term | Definition |
|------|-----------|
| **Closed** | A project with status `COMPLETED` or `DROPPED` |
| **Closed date** | `completedAt` for completed projects; `updatedAt` for dropped projects (since dropped projects don't set `completedAt`) |
| **Root project** | A project where `parentProjectId IS NULL` |
| **Project tree** | A root project and all its descendants (child/grandchild sub-projects) |
| **Retention period** | Configurable duration after which closed project trees become eligible for purge (default: 180 days) |
| **Grace period** | Window between "eligible for purge" notification and actual deletion (default: 30 days) |

---

## 3. Eligibility Rules

A project tree is eligible for purge when **all** of the following are true:

### 3.1 Root-Level Evaluation

The purge engine always evaluates from the **root project** down. Sub-projects are never independently purged — they follow their root's lifecycle.

1. The **root project** has status `COMPLETED` or `DROPPED`
2. The root project's closed date is **≥ retention period** ago
3. **All** sub-projects in the tree are also `COMPLETED` or `DROPPED`

### 3.2 Mixed-State Trees

If a root project is closed but any descendant is still `ACTIVE`, `ON_HOLD`, or `SOMEDAY_MAYBE`:

- The tree is **not eligible** for purge
- This is logged as an anomaly (a closed parent with active children suggests a cascade bug or manual override)
- The dashboard stale projects warning should surface this

### 3.3 Standalone Tasks

Completed or dropped tasks **not** assigned to any project are also subject to retention:

- Standalone tasks with `status = COMPLETED` or `DROPPED` where the closed date is ≥ retention period ago are eligible
- These are purged in the same sweep as project trees

### 3.4 Excluded from Purge

The following are **never** purged by this system:

- `ACTIVE` projects and their trees
- `ON_HOLD` projects (intentionally paused, not abandoned)
- `SOMEDAY_MAYBE` projects (these are GTD's "incubation" list)
- Active standalone tasks
- Areas of responsibility
- Goals (even if achieved — these are reference material at the horizon level)
- Horizon notes
- Weekly review records
- Contexts
- Wiki articles
- Waiting-for items (these follow their own lifecycle)

---

## 4. What Gets Deleted

When a project tree is purged, the following data is removed **in a single transaction**:

For each project in the tree (root → leaves):

1. **TaskDependency** records (predecessors/successors for tasks in this project)
2. **TaskSnapshot** records
3. **TaskEvent** records
4. **Tasks** belonging to the project
5. **BaselineSnapshot** records
6. **ProjectMember** records
7. **ProjectEvent** records
8. **Project** record itself

For standalone tasks:

1. **TaskDependency** records
2. **TaskSnapshot** records
3. **TaskEvent** records
4. **Task** record

### 4.1 Cross-References

Before deleting, the purge engine must handle references from **outside** the tree:

- **TaskDependency** where a task outside the tree depends on a task inside it: These dependencies should already be resolved (predecessor completed), so delete the dependency record. Log a warning if any unresolved cross-tree dependencies exist.
- **Project `goalId`**: Nullify the goal's project count, but do **not** delete the goal. Goals are horizon-level entities that outlive individual projects.

---

## 5. Safety Mechanisms

### 5.1 Grace Period & Notification

When a project tree first becomes eligible for purge:

1. A `RETENTION_WARNING` project event is written with the scheduled purge date
2. The project owner receives an in-app notification: *"Project '[title]' and its [N] tasks will be permanently deleted on [date]. Export or reactivate to keep."*
3. If email notifications are enabled, include in the next digest
4. The project appears in a dedicated **"Scheduled for Deletion"** section in the archive view

### 5.2 Export Before Delete

Before any purge executes, the system generates a JSON export of the entire project tree:

```json
{
  "exportedAt": "2026-09-01T00:00:00Z",
  "retentionPolicy": { "periodDays": 180, "graceDays": 30 },
  "project": {
    "id": "...",
    "title": "...",
    "outcome": "...",
    "status": "COMPLETED",
    "completedAt": "2026-02-15T...",
    "tasks": [...],
    "events": [...],
    "subProjects": [...]
  }
}
```

Two export files are generated per project tree:

- **JSON** (`{projectId}.json`) — Full hierarchical export with all events, snapshots, and sub-projects. Canonical format for potential re-import.
- **CSV** (`{projectId}.csv`) — Flat task list with columns: task title, status, project, completed date, time estimate, actual minutes, context, energy level, notes. Accessible for users who want to review or analyze completed work in a spreadsheet.

Export files are stored in a configurable location (default: `data/purge-exports/`) and retained for an additional configurable period (default: 90 days) before the export files themselves are cleaned up. This gives a last-resort recovery window.

### 5.3 Reactivation Cancels Purge

If a user reactivates a project (changes status back to `ACTIVE`) during the grace period:

- The scheduled purge is cancelled
- The `RETENTION_WARNING` event remains in history for audit
- The retention clock resets — the project must be closed again for a full retention period before becoming re-eligible

### 5.4 Dry Run Mode

The purge job supports a `--dry-run` flag (and equivalent API parameter) that:

- Identifies all eligible trees
- Calculates total records that would be deleted
- Logs everything to stdout/a report
- Deletes nothing

This should be the default for the first run on any instance.

---

## 6. Configuration

### 6.1 Instance-Level Settings

Stored in a `SystemSettings` model (or environment variables for simpler deployments):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `RETENTION_PERIOD_DAYS` | integer | 180 | Days after close before purge eligibility |
| `RETENTION_GRACE_DAYS` | integer | 30 | Days between warning and actual deletion |
| `RETENTION_EXPORT_PATH` | string | `data/purge-exports/` | Where JSON exports are stored |
| `RETENTION_EXPORT_KEEP_DAYS` | integer | 90 | How long to keep export files |
| `RETENTION_ENABLED` | boolean | true | Master switch to disable purge entirely |
| `RETENTION_STANDALONE_TASKS` | boolean | true | Whether to also purge orphaned completed tasks |
| `RETENTION_BATCH_SIZE` | integer | 10 | Max project trees to purge per run (prevents long locks) |

### 6.2 Per-Project Override

Add an optional field to the Project model:

```prisma
model Project {
  // ... existing fields ...
  retentionExempt  Boolean @default(false) @map("retention_exempt")
}
```

When `retentionExempt = true`, the project tree is never auto-purged regardless of age. This is for projects the user explicitly wants to keep as reference (rare, but some people want it).

---

## 7. Implementation

### 7.1 Schema Changes

```prisma
// Add to Project model
model Project {
  retentionExempt   Boolean   @default(false) @map("retention_exempt")
  purgeScheduledAt  DateTime? @map("purge_scheduled_at")  // Set when grace period starts
}
```

New index for efficient eligibility queries:

```sql
CREATE INDEX idx_project_purge_eligible 
ON "Project" (status, "completedAt", "parent_project_id", "retention_exempt")
WHERE status IN ('COMPLETED', 'DROPPED') 
  AND "retention_exempt" = false;
```

### 7.2 Purge Service

`src/lib/services/retention-service.ts`

Core functions:

```typescript
// Find all root project trees eligible for purge
async function findEligibleTrees(dryRun?: boolean): Promise<PurgeCandidate[]>

// Schedule purge (write warning event, set purgeScheduledAt)
async function schedulePurge(projectId: string): Promise<void>

// Execute purge for a single project tree
async function purgeProjectTree(projectId: string): Promise<PurgeResult>

// Execute purge for standalone tasks
async function purgeStandaloneTasks(): Promise<PurgeResult>

// Export project tree to JSON + CSV before deletion
async function exportProjectTree(projectId: string): Promise<{ jsonPath: string, csvPath: string }>

// Clean up old export files
async function cleanupExports(): Promise<number> // returns files deleted
```

### 7.3 Eligibility Query Logic

```sql
-- Find root projects eligible for purge
SELECT p.id, p.title, p.status, p."completedAt", p."updatedAt"
FROM "Project" p
WHERE p."parent_project_id" IS NULL           -- root projects only
  AND p.status IN ('COMPLETED', 'DROPPED')    -- closed
  AND p."retention_exempt" = false             -- not exempt
  AND p."purgeScheduledAt" IS NULL             -- not already scheduled
  AND (
    -- Completed projects: use completedAt
    (p.status = 'COMPLETED' AND p."completedAt" <= NOW() - INTERVAL '180 days')
    OR
    -- Dropped projects: use updatedAt as proxy for close date
    (p.status = 'DROPPED' AND p."updatedAt" <= NOW() - INTERVAL '180 days')
  )
  -- Ensure ALL descendants are also closed
  AND NOT EXISTS (
    SELECT 1 FROM "Project" child
    WHERE child.path LIKE p.id || '/%'
      AND child.status NOT IN ('COMPLETED', 'DROPPED')
  );
```

### 7.4 Deletion Order

Within a transaction, delete in dependency-safe order (leaves first):

1. Collect all project IDs in the tree (root + descendants via `path`)
2. Collect all task IDs belonging to those projects
3. Delete `TaskDependency` where predecessor or successor is in task set
4. Delete `TaskSnapshot` for tasks in set
5. Delete `TaskEvent` for tasks in set
6. Delete `Task` records in set
7. Delete `BaselineSnapshot` for projects in set
8. Delete `ProjectMember` for projects in set
9. Delete `ProjectEvent` for projects in set
10. Delete `Project` records, children first (deepest depth → 0)

### 7.5 Scheduling

The purge runs as a **cron job** via a dedicated endpoint or CLI command:

```bash
# Run nightly at 3 AM (off-peak)
0 3 * * * cd /opt/tandem && npx tsx src/scripts/retention-purge.ts
```

**Two-phase execution per run:**

1. **Phase 1 — Schedule:** Find newly eligible trees → write `RETENTION_WARNING` events → set `purgeScheduledAt` to now + grace period
2. **Phase 2 — Purge:** Find trees where `purgeScheduledAt <= NOW()` → export → delete → log

This naturally enforces the grace period across runs.

### 7.6 API Endpoint

```
POST /api/admin/retention/run
  Body: { dryRun?: boolean, batchSize?: number }
  Response: { scheduled: number, purged: number, details: [...] }

GET /api/admin/retention/status
  Response: { 
    enabled: boolean,
    settings: {...},
    pendingPurges: [...],    // Trees in grace period
    eligibleTrees: [...],    // Trees that will be scheduled next run
    recentPurges: [...]      // Last 20 purges with dates
  }

POST /api/admin/retention/exempt/:projectId
  Body: { exempt: boolean }
  // Toggle retention exemption for a project
```

### 7.7 CLI Script

`src/scripts/retention-purge.ts`

```bash
# Dry run (default for safety)
npx tsx src/scripts/retention-purge.ts --dry-run

# Actual purge
npx tsx src/scripts/retention-purge.ts --execute

# Custom batch size
npx tsx src/scripts/retention-purge.ts --execute --batch-size=5

# Purge specific project tree (bypass scheduling)
npx tsx src/scripts/retention-purge.ts --execute --project-id=<id>
```

---

## 8. Team Projects

For team projects, additional rules apply:

- Only team **admins** can toggle `retentionExempt`
- The purge notification goes to **all team members** who had tasks in the project
- The JSON export is accessible to team admins
- Team-level retention settings can override instance defaults (shorter or longer)

---

## 9. UI Touchpoints

### 9.1 Archive View Enhancement

Add a **"Scheduled for Deletion"** filter/section showing:

- Project title and completion date
- Days until purge
- Quick actions: "Export JSON", "Reactivate", "Delete Now", "Exempt from Purge"

### 9.2 Project Detail

When viewing a project in grace period:

- Banner: "This project is scheduled for deletion on [date]. [Reactivate] [Export] [Exempt]"

### 9.3 Admin Settings

- Toggle retention on/off
- Configure retention period (days)
- Configure grace period (days)  
- View/download recent exports
- Run manual dry-run
- View purge history log

### 9.4 Weekly Review Integration

During the weekly review "Get Current" phase, surface:

- "N projects are scheduled for deletion in the next 30 days. Review?"
- Allow quick exemption or reactivation from the review flow

---

## 10. Logging & Audit

Every purge action writes to a `RetentionLog` table:

```prisma
model RetentionLog {
  id            String   @id @default(cuid())
  action        String   // SCHEDULED, PURGED, CANCELLED, EXPORTED, EXEMPTED
  projectId     String?  // The root project (null for standalone task purges)
  projectTitle  String?  // Captured at time of action (since project may be deleted)
  taskCount     Int?     // Number of tasks affected
  eventCount    Int?     // Number of events deleted
  exportPath    String?  // Path to export file if applicable
  actorType     String   // SYSTEM (cron) or USER (manual)
  actorId       String?
  details       Json?    // Additional context
  createdAt     DateTime @default(now())

  @@index([action, createdAt])
  @@index([projectId])
}
```

---

## 11. Migration & Rollout

### 11.1 Phase 1 — Schema + Dry Run Only

1. Add `retentionExempt` and `purgeScheduledAt` to Project model
2. Add `RetentionLog` model
3. Deploy retention service with `RETENTION_ENABLED=false`
4. Run dry-run manually to see what would be affected
5. Review results with beta users

### 11.2 Phase 2 — Grace Period Scheduling

1. Enable `RETENTION_ENABLED=true`
2. First runs only **schedule** (Phase 1 of two-phase execution)
3. Users see notifications and can react
4. No data is deleted yet

### 11.3 Phase 3 — Full Purge Active

1. After grace period elapses (~30 days after Phase 2)
2. Purge phase begins executing
3. Exports are generated and stored
4. Monitor logs for any issues

### 11.4 Existing Data

On first activation, all currently eligible trees (closed > 180 days ago) enter the grace period simultaneously. The batch size setting prevents overwhelming the system — it will take multiple runs to work through the backlog, which is fine.

---

## 12. Resolved Design Decisions

1. **Dropped project close date:** No new field needed. Both `COMPLETED` and `DROPPED` status changes update `updatedAt`, which serves as the effective close date. Since no further updates occur on a closed project unless it's reactivated, `updatedAt` is reliable for both statuses.

2. **Inbox items:** Excluded from retention purge. Inbox items should be processed and turned into projects/tasks or moved to reference material. If they're lingering unprocessed, that's a weekly review concern, not a retention concern.

3. **Waiting-for items:** Excluded. Open waiting-for items are active tasks — leave them alone. Resolved waiting-for items are lightweight enough to not warrant automated purge.

4. **Export format:** Offer both JSON and CSV. JSON captures the full tree structure and is the canonical export. CSV provides a flat task list for users who want to review or analyze their completed work without needing to parse JSON. Both are generated during the export-before-delete phase.

5. **Federation implications:** Deferred to federation spec. When cross-instance collaboration is implemented, purge policies will need to respect data that other instances may reference. Flag this as a constraint in the federation design.

---

*This spec is a living document. Bring it to Claude Code sessions for Tandem implementation.*
