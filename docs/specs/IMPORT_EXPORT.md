# Import / Export — Data Portability

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Tandem is a self-hosted GTD app. Users who adopt it need two things they currently lack:

1. **A way to get data out** — for backups, migration to another tool, or compliance with data portability expectations. Right now the only way to extract data is direct database access.
2. **A way to get data in** — users switching from Todoist, Things, OmniFocus, or another task manager need to import their existing system. Starting from zero is a dealbreaker for anyone with hundreds of tasks.

Admins also need a server-wide export for backup and disaster recovery purposes that goes beyond the PostgreSQL-level backups covered in `docs/specs/DR_BACKUP.md`.

### What Done Looks Like

1. Any user can export their complete GTD system (tasks, projects, inbox, contexts, areas, goals, horizons, wiki articles) as a single JSON file, or export tasks/projects as CSV for spreadsheet users.
2. Any user can import from Tandem JSON (restore from backup or migrate between instances), Todoist CSV, or a generic CSV with column mapping.
3. The import flow shows a preview of what will be created before committing, with duplicate detection and conflict resolution.
4. Admins can trigger a server-wide export (all users, all data) for backup/migration purposes.
5. Large exports and imports run asynchronously with progress tracking.

### What Exists

- `EventSource.IMPORT` already exists in the Prisma schema — the event sourcing system anticipates import operations
- `SnapshotReason.BULK_OPERATION` exists for snapshot tracking
- The `ActorContext` in `src/lib/services/task-service.ts` already accepts `source: "IMPORT"`
- `docs/specs/DR_BACKUP.md` covers PostgreSQL-level backups but not application-level export/import

---

## 2. Data Model Changes

### 2.1 ImportJob Model

Track async import operations:

```prisma
model ImportJob {
  id            String          @id @default(cuid())
  status        ImportJobStatus @default(PENDING)
  source        String          // "tandem_json", "todoist_csv", "omnifocus_csv", "generic_csv"
  fileName      String          // Original upload filename
  totalItems    Int             @default(0)
  processedItems Int            @default(0)
  createdItems  Int             @default(0)
  skippedItems  Int             @default(0)
  errorCount    Int             @default(0)
  errors        Json?           // Array of { row: number, field: string, message: string }
  mapping       Json?           // Column mapping for CSV imports
  preview       Json?           // Preview data shown before confirmation
  confirmedAt   DateTime?       // When user confirmed after preview
  completedAt   DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
}

enum ImportJobStatus {
  PENDING         // File uploaded, awaiting preview/confirmation
  PREVIEWING      // Parsing file, generating preview
  AWAITING_CONFIRM // Preview ready, waiting for user to confirm
  PROCESSING      // Import in progress
  COMPLETED       // Import finished successfully
  FAILED          // Import failed (see errors)
  CANCELLED       // User cancelled after preview
}
```

Add the relation on `User`:

```prisma
// In model User
importJobs ImportJob[]
```

### 2.2 No Changes to Existing Models

Export reads existing data — no schema changes needed. Import creates records using existing service functions (`createTask`, `createProject`, `createInboxItem`) which handle event history, cascade logic, and next-action computation.

---

## 3. Export Implementation

### 3.1 JSON Export Format

The canonical Tandem export format. Machine-readable, complete, and restorable.

```typescript
// src/lib/export/tandem-json.ts

interface TandemExport {
  version: 1;
  exportedAt: string; // ISO 8601
  user: {
    name: string;
    email: string;
  };
  data: {
    tasks: TaskExport[];
    projects: ProjectExport[];
    inboxItems: InboxItemExport[];
    contexts: ContextExport[];
    areas: AreaExport[];
    goals: GoalExport[];
    horizonNotes: HorizonNoteExport[];
    wikiArticles: WikiArticleExport[];
    waitingFor: WaitingForExport[];
    recurringTemplates: RecurringTemplateExport[];
    weeklyReviews: WeeklyReviewExport[];
  };
  counts: Record<string, number>; // Summary counts for each entity type
}

interface TaskExport {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  isNextAction: boolean;
  estimatedMins: number | null;
  energyLevel: string | null;
  scheduledDate: string | null;
  dueDate: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  // References by title (not IDs, since IDs differ across instances)
  projectTitle: string | null;
  contextName: string | null;
}

interface ProjectExport {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  outcome: string | null;
  sortOrder: number;
  isSomedayMaybe: boolean;
  completedAt: string | null;
  createdAt: string;
  areaName: string | null;
  goalTitle: string | null;
  parentProjectTitle: string | null;
}
```

Each entity exports with human-readable references (titles/names) rather than foreign key IDs. On import, references are resolved by matching titles within the same import batch or existing data.

### 3.2 CSV Export Format

For spreadsheet users. One CSV per entity type (tasks.csv, projects.csv). Flat structure — no nested relations.

```
title,notes,status,isNextAction,estimatedMins,energyLevel,scheduledDate,dueDate,project,context,createdAt,completedAt
"Buy groceries","Eggs, milk, bread",NOT_STARTED,true,30,LOW,,,@Errands,@Home,2026-02-20T10:00:00Z,
"Write quarterly report",,IN_PROGRESS,true,120,HIGH,,2026-03-01T00:00:00Z,Work Q1,@Office,2026-02-15T08:00:00Z,
```

### 3.3 Export API

```
GET /api/export?format=json&scope=all
GET /api/export?format=json&scope=tasks
GET /api/export?format=json&scope=projects
GET /api/export?format=csv&scope=tasks
GET /api/export?format=csv&scope=projects
```

Query parameters:

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `format` | `json`, `csv` | `json` | Output format |
| `scope` | `all`, `tasks`, `projects`, `inbox`, `contexts`, `areas`, `goals`, `horizons`, `wiki` | `all` | What to export |
| `includeCompleted` | `true`, `false` | `true` | Include completed/dropped items |

Response: streams the file as a download with appropriate `Content-Type` and `Content-Disposition` headers.

```typescript
// src/app/api/export/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { exportTandemJson } from "@/lib/export/tandem-json";
import { exportTasksCsv, exportProjectsCsv } from "@/lib/export/csv";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";
  const scope = searchParams.get("scope") || "all";
  const includeCompleted = searchParams.get("includeCompleted") !== "false";

  if (format === "json") {
    const data = await exportTandemJson(userId, scope, includeCompleted);
    const json = JSON.stringify(data, null, 2);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="tandem-export-${scope}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  if (format === "csv") {
    if (scope !== "tasks" && scope !== "projects") {
      return badRequest("CSV export supports 'tasks' or 'projects' scope only");
    }
    const csv = scope === "tasks"
      ? await exportTasksCsv(userId, includeCompleted)
      : await exportProjectsCsv(userId, includeCompleted);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="tandem-${scope}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return badRequest("Invalid format. Use 'json' or 'csv'.");
}
```

### 3.4 Admin Server-Wide Export

```
GET /api/admin/export?format=json
```

Admin-only endpoint that exports all users' data. Each user's data is nested under their email. Uses the same `exportTandemJson` function per user, aggregated into a wrapper.

```typescript
interface ServerExport {
  version: 1;
  exportedAt: string;
  serverSettings: Record<string, unknown>;
  users: Array<{
    email: string;
    name: string;
    isAdmin: boolean;
    data: TandemExport["data"];
  }>;
}
```

---

## 4. Import Implementation

### 4.1 Import Flow

The import follows a multi-step process:

1. **Upload** — user selects file, chooses source type (Tandem JSON, Todoist CSV, generic CSV)
2. **Parse & Preview** — server parses the file, creates an `ImportJob` in `PREVIEWING` status, returns a preview of items to be created
3. **Map Columns** (CSV only) — user maps CSV columns to Tandem fields
4. **Confirm** — user reviews the preview, adjusts conflict resolution, and confirms
5. **Process** — server creates records using existing service functions, updates `ImportJob` progress
6. **Complete** — show summary (created, skipped, errors)

### 4.2 Import API

```
POST /api/import/upload
```

Accepts `multipart/form-data` with the file and source type. Returns an `ImportJob` with `id` and `status: "PREVIEWING"`.

```
GET /api/import/[jobId]
```

Returns current job status, preview data, and progress.

```
POST /api/import/[jobId]/mapping
```

For CSV imports — saves the column mapping.

```
POST /api/import/[jobId]/confirm
```

Triggers the actual import. Sets `confirmedAt` and status to `PROCESSING`.

```
POST /api/import/[jobId]/cancel
```

Cancels the import job.

### 4.3 Import Parsers

```typescript
// src/lib/import/parsers/tandem-json.ts
export function parseTandemJson(content: string): ImportPreview { ... }

// src/lib/import/parsers/todoist-csv.ts
export function parseTodoistCsv(content: string): ImportPreview { ... }

// src/lib/import/parsers/generic-csv.ts
export function parseGenericCsv(content: string, mapping: ColumnMapping): ImportPreview { ... }
```

Each parser returns a normalized `ImportPreview`:

```typescript
interface ImportPreview {
  tasks: Array<{
    title: string;
    notes?: string;
    status: string;
    project?: string;
    context?: string;
    dueDate?: string;
    energyLevel?: string;
    estimatedMins?: number;
    isDuplicate: boolean;      // Matches existing by title+project
    duplicateAction: "skip" | "overwrite"; // User can change
  }>;
  projects: Array<{
    title: string;
    description?: string;
    type: string;
    isDuplicate: boolean;
    duplicateAction: "skip" | "overwrite";
  }>;
  contexts: Array<{
    name: string;
    isDuplicate: boolean;
  }>;
  // ... other entity types for Tandem JSON imports
}
```

### 4.4 Todoist Field Mapping

| Todoist Field | Tandem Field | Notes |
|---|---|---|
| `TYPE` | (filter) | Only import rows where TYPE = "task" |
| `CONTENT` | `title` | |
| `DESCRIPTION` | `notes` | |
| `PRIORITY` | `energyLevel` | p1 = HIGH, p2 = MEDIUM, p3/p4 = LOW |
| `INDENT` | (derive) | Indent level > 1 = sub-task under parent |
| `AUTHOR` | (ignore) | |
| `RESPONSIBLE` | (ignore) | |
| `DATE` | `dueDate` | Parse Todoist date format |
| `DATE_LANG` | (ignore) | |
| `TIMEZONE` | (ignore) | |
| `PROJECT` | `projectTitle` | Create project if not found |
| `LABELS` | `contextName` | First label maps to context; rest ignored or stored in notes |

### 4.5 Duplicate Detection

Before import, check for duplicates:

```typescript
async function detectDuplicates(
  userId: string,
  items: { title: string; projectTitle?: string }[]
): Promise<Map<number, string>> {
  // Returns a map of item-index → existing-task-id for duplicates
  const existingTasks = await prisma.task.findMany({
    where: { userId },
    select: { id: true, title: true, project: { select: { title: true } } },
  });

  const duplicates = new Map<number, string>();
  for (let i = 0; i < items.length; i++) {
    const match = existingTasks.find(
      (t) =>
        t.title.toLowerCase() === items[i].title.toLowerCase() &&
        (t.project?.title || null) === (items[i].projectTitle || null)
    );
    if (match) duplicates.set(i, match.id);
  }
  return duplicates;
}
```

### 4.6 Import Processing

```typescript
// src/lib/import/processor.ts

export async function processImport(jobId: string): Promise<void> {
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  const preview = job.preview as ImportPreview;

  // Create contexts first (other items reference them)
  const contextMap = new Map<string, string>(); // name → id
  for (const ctx of preview.contexts) {
    if (ctx.isDuplicate) continue;
    const created = await prisma.context.create({
      data: { name: ctx.name, userId: job.userId },
    });
    contextMap.set(ctx.name, created.id);
  }

  // Create projects next
  const projectMap = new Map<string, string>(); // title → id
  for (const proj of preview.projects) {
    if (proj.isDuplicate && proj.duplicateAction === "skip") continue;
    const created = await createProject(job.userId, {
      title: proj.title,
      description: proj.description,
      type: proj.type as "SEQUENTIAL" | "PARALLEL" | "SINGLE_ACTIONS",
    }, {
      actorType: "SYSTEM",
      actorId: job.userId,
      source: "IMPORT",
    });
    projectMap.set(proj.title, created.id);
  }

  // Create tasks
  for (const task of preview.tasks) {
    if (task.isDuplicate && task.duplicateAction === "skip") continue;
    const projectId = task.project
      ? projectMap.get(task.project) || (await findProjectByTitle(job.userId, task.project))
      : undefined;
    const contextId = task.context
      ? contextMap.get(task.context) || (await findContextByName(job.userId, task.context))
      : undefined;

    await createTask(job.userId, {
      title: task.title,
      notes: task.notes,
      projectId,
      contextId,
      dueDate: task.dueDate,
      energyLevel: task.energyLevel as "LOW" | "MEDIUM" | "HIGH" | undefined,
      estimatedMins: task.estimatedMins,
    }, {
      actorType: "SYSTEM",
      actorId: job.userId,
      source: "IMPORT",
    });

    await prisma.importJob.update({
      where: { id: jobId },
      data: { processedItems: { increment: 1 }, createdItems: { increment: 1 } },
    });
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}
```

---

## 5. Validation Schemas

```typescript
// src/lib/validations/import-export.ts

import { z } from "zod";

export const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  scope: z.enum([
    "all", "tasks", "projects", "inbox", "contexts",
    "areas", "goals", "horizons", "wiki"
  ]).default("all"),
  includeCompleted: z.coerce.boolean().default(true),
});

export const importUploadSchema = z.object({
  source: z.enum(["tandem_json", "todoist_csv", "omnifocus_csv", "generic_csv"]),
});

export const importMappingSchema = z.object({
  mapping: z.record(z.string(), z.string()), // CSV column → Tandem field
});

export const importConfirmSchema = z.object({
  duplicateAction: z.enum(["skip", "overwrite"]).default("skip"),
  // Per-item overrides are stored on the ImportJob.preview
});
```

---

## 6. UI

### 6.1 Export Section (Settings Page)

Add an "Export" section to the existing Settings page (`/settings`):

```
┌──────────────────────────────────────────────────────────────┐
│  Export Your Data                                             │
│                                                              │
│  Format: [JSON ▼]    Scope: [Everything ▼]                   │
│                                                              │
│  ☑ Include completed items                                   │
│                                                              │
│  [Download Export]                                            │
│                                                              │
│  JSON includes all data (tasks, projects, inbox, contexts,   │
│  areas, goals, horizons, wiki). CSV is available for tasks   │
│  and projects.                                               │
└──────────────────────────────────────────────────────────────┘
```

Component: `src/components/settings/ExportSection.tsx`

### 6.2 Import Page

Dedicated page at `/settings/import` with a multi-step flow:

```
Step 1: Upload
┌──────────────────────────────────────────────────────────────┐
│  Import Data                                                 │
│                                                              │
│  Source: ○ Tandem JSON   ○ Todoist CSV   ○ Generic CSV       │
│                                                              │
│  ┌────────────────────────────────────┐                      │
│  │                                    │                      │
│  │     Drop file here or click to     │                      │
│  │     browse                         │                      │
│  │                                    │                      │
│  └────────────────────────────────────┘                      │
│                                                              │
│  [Upload & Preview]                                          │
└──────────────────────────────────────────────────────────────┘

Step 2: Preview
┌──────────────────────────────────────────────────────────────┐
│  Import Preview                                              │
│                                                              │
│  Will create:                                                │
│    12 tasks  •  3 projects  •  2 contexts                    │
│                                                              │
│  ⚠ 2 potential duplicates found:                             │
│    "Buy groceries" (in project "Home") — [Skip] [Overwrite] │
│    "Weekly standup" (in project "Work") — [Skip] [Overwrite] │
│                                                              │
│  Tasks:                                                      │
│  ┌──────────────────────────────────────────────────┐        │
│  │ Title          │ Project  │ Context │ Due Date   │        │
│  │ Buy groceries  │ Home     │ @Errands│ —          │        │
│  │ Fix login bug  │ Work     │ @Office │ 2026-03-01 │        │
│  │ ...            │          │         │            │        │
│  └──────────────────────────────────────────────────┘        │
│                                                              │
│  [Cancel]                            [Confirm Import]        │
└──────────────────────────────────────────────────────────────┘

Step 3: Progress / Complete
┌──────────────────────────────────────────────────────────────┐
│  Import Complete ✓                                           │
│                                                              │
│  Created: 10 tasks, 3 projects, 2 contexts                  │
│  Skipped: 2 duplicates                                       │
│  Errors: 0                                                   │
│                                                              │
│  [Go to Do Now]                   [Import More]              │
└──────────────────────────────────────────────────────────────┘
```

Components:
```
src/components/import/
  ImportUploadStep.tsx       — File upload + source selection
  ImportMappingStep.tsx      — Column mapping for CSV (generic CSV only)
  ImportPreviewStep.tsx      — Preview table + duplicate resolution
  ImportProgressStep.tsx     — Progress bar during processing
  ImportCompleteStep.tsx     — Summary + navigation
```

Page route: `src/app/(dashboard)/settings/import/page.tsx`

### 6.3 Admin Export

Add to admin settings (`/admin/settings`):

```
┌──────────────────────────────────────────────────────────────┐
│  Server Backup                                               │
│                                                              │
│  Export all users' data as a single JSON file for backup     │
│  or migration to another Tandem instance.                    │
│                                                              │
│  [Download Server Export]                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Phases

### Phase 1: Tandem JSON Export

**Goal:** Users can download a complete JSON backup of their data.

**Schema changes:** None.

**Code changes:**
- `src/lib/export/tandem-json.ts` — JSON export builder (new)
- `src/app/api/export/route.ts` — GET endpoint (new)
- `src/lib/validations/import-export.ts` — Zod schemas (new)
- `src/components/settings/ExportSection.tsx` — Export UI (new)
- `src/app/(dashboard)/settings/page.tsx` — Add ExportSection

**Files touched:** 5 (2 lib, 1 API route, 1 validation, 1 component, 1 page update)

### Phase 2: CSV Export

**Goal:** Download tasks and projects as CSV files.

**Code changes:**
- `src/lib/export/csv.ts` — CSV builder for tasks and projects (new)
- Update `src/app/api/export/route.ts` to handle `format=csv`
- Update `src/components/settings/ExportSection.tsx` with format selector

**Files touched:** 3 (1 lib, 1 API update, 1 component update)

### Phase 3: Tandem JSON Import

**Goal:** Restore from a Tandem JSON export.

**Schema changes:**
- Add `ImportJob` model and `ImportJobStatus` enum to `schema.prisma`
- Add `importJobs` relation on `User`
- Migration: `npx prisma migrate dev --name add-import-job`

**Code changes:**
- `src/lib/import/parsers/tandem-json.ts` — JSON parser (new)
- `src/lib/import/processor.ts` — Import processor (new)
- `src/lib/import/duplicate-detection.ts` — Duplicate checker (new)
- `src/app/api/import/upload/route.ts` — POST upload (new)
- `src/app/api/import/[jobId]/route.ts` — GET status (new)
- `src/app/api/import/[jobId]/confirm/route.ts` — POST confirm (new)
- `src/app/api/import/[jobId]/cancel/route.ts` — POST cancel (new)
- `src/components/import/ImportUploadStep.tsx` — Upload UI (new)
- `src/components/import/ImportPreviewStep.tsx` — Preview UI (new)
- `src/components/import/ImportProgressStep.tsx` — Progress UI (new)
- `src/components/import/ImportCompleteStep.tsx` — Summary UI (new)
- `src/app/(dashboard)/settings/import/page.tsx` — Import page (new)

**Files touched:** ~14 (1 schema, 3 lib, 4 API routes, 4 components, 1 page)

### Phase 4: Todoist CSV Import

**Goal:** Import from Todoist export files.

**Code changes:**
- `src/lib/import/parsers/todoist-csv.ts` — Todoist CSV parser with field mapping (new)
- Update `src/components/import/ImportUploadStep.tsx` with Todoist option

**Files touched:** 2

### Phase 5: Generic CSV Import

**Goal:** Import any CSV with user-defined column mapping.

**Code changes:**
- `src/lib/import/parsers/generic-csv.ts` — Generic CSV parser (new)
- `src/components/import/ImportMappingStep.tsx` — Column mapping UI (new)
- `src/app/api/import/[jobId]/mapping/route.ts` — Save mapping (new)

**Files touched:** 3

### Phase 6: Admin Server Export

**Goal:** Admins can export all users' data.

**Code changes:**
- `src/app/api/admin/export/route.ts` — Admin export endpoint (new)
- Admin settings UI update

**Files touched:** 2

---

## 8. Edge Cases

- **Large exports** — For accounts with thousands of tasks, JSON export could be several MB. Stream the response rather than building the full string in memory. CSV is naturally streamable.
- **Large imports** — Process in batches of 100 items within a transaction to avoid long-running transactions. Update `ImportJob.processedItems` after each batch.
- **Circular project references** — When importing sub-projects from Tandem JSON, sort by `depth` and import parents before children.
- **Missing contexts on import** — If a task references a context that does not exist and is not in the import file, create it automatically.
- **Concurrent imports** — Prevent multiple simultaneous imports per user. Check for an existing `PROCESSING` ImportJob before allowing a new upload.
- **File size limits** — Cap upload at 50MB. Validate before parsing.
- **Invalid JSON/CSV** — Return clear error messages with line numbers for parse failures.
- **Timezone handling** — Store all dates as UTC. Export includes ISO 8601 with timezone. Import normalizes to UTC.

---

## 9. What This Spec Does Not Cover

- **OmniFocus import** — Listed in the requirements but deferred. OmniFocus uses a proprietary `.ofocus` format (SQLite + XML). A community library or intermediate CSV export from OmniFocus would be needed. Add when there is user demand.
- **Things JSON import** — Things 3 does not have an official export format. Its Shortcuts/AppleScript integration produces JSON, but the schema varies. Defer until the format is studied.
- **Automatic scheduled exports** — No cron-based export. Users trigger exports manually. Automated backups are handled at the DB level per `DR_BACKUP.md`.
- **Undo for imports** — No rollback of a completed import. If needed, the user can delete imported items manually or restore from a pre-import backup.
- **MCP import/export tools** — Not adding MCP tools in this spec. Can be added later if AI-assisted data migration is useful.
- **Inter-user data transfer** — This spec covers single-user import/export only. Moving data between users within the same instance is a Teams concern.

---

## 10. Future Considerations

- **Export scheduling** — Weekly automatic export to a configured S3 bucket or local path.
- **Incremental export** — Export only items changed since a given timestamp. Useful for sync-style workflows.
- **MCP tools** — `tandem_export` and `tandem_import_status` tools for AI-assisted backup workflows.
- **Import from API** — Allow importing via API POST with JSON body (not just file upload), useful for programmatic migration scripts.
- **Import undo** — Tag all items created by an import job (via `importJobId` FK on Task/Project) to enable batch deletion of an entire import.
```

---
