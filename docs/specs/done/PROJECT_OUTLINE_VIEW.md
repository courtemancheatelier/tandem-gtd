# Tandem Feature Spec: Project Outline Views & Gantt Admin Toggle

**Version:** 1.0
**Date:** February 23, 2026
**Author:** Jason Courtemanche
**Status:** Draft

---

## 1. Problem Statement & Motivation

### Path A vs Path B

Tandem sits at a fork. **Path A** doubles down on PM tooling — more Gantt features, resource leveling, earned value analysis, baseline comparison workflows. Path B recognizes that Tandem's *actual* differentiator isn't the Gantt chart. It's the **cascade engine**: processing types (Sequential / Parallel / Single Actions), automatic next-action promotion, cross-project dependency resolution, and rollup propagation. No other tool does GTD-style action management with real dependency awareness.

**We're choosing Path B.**

The Gantt chart is useful for teams that need timeline visualization, but most Tandem users are GTD practitioners who think in terms of projects, next actions, and contexts — not bars on a timeline. The outline view is the natural interface for this mental model: a collapsible tree of projects and their tasks, showing processing type, next-action status, and context at a glance.

### What's Wrong Today

The current project detail page (`/projects/[id]`) renders sub-projects as a **flat link list** — a collapsible section with status dots and progress bars that navigate to separate pages. To see a sub-project's tasks, you leave the parent page entirely. There's no way to see the full project landscape in one view. You're constantly clicking between pages to understand what's happening across projects.

There's also no way to **disable the Gantt chart** for deployments that don't need it. The button is always present, and the SVAR library is always available.

### What This Spec Adds

1. **Gantt Admin Toggle** — A `ganttEnabled` flag on `ServerSettings` so admins can hide Gantt entirely
2. **Per-Project Outline View** — Sub-projects render inline with their tasks on the parent project page (replacing the flat link list)
3. **Master Project View** — A new top-level page showing ALL projects as an expandable outline/tree

---

## 2. Data Model

### 2.1 What Already Exists

The data model already supports everything this feature needs. No schema migrations required for the outline views.

**Project hierarchy** (self-referential relation):
```prisma
model Project {
  parentProjectId  String?        @map("parent_project_id")
  parentProject    Project?       @relation("ProjectChildren", fields: [parentProjectId], references: [id], onDelete: SetNull)
  childProjects    Project[]      @relation("ProjectChildren")
  depth            Int            @default(0)       // 0=root, 1=child, 2=work package
  path             String         @default("")      // Materialized path for hierarchy queries
  type             ProjectType                      // SEQUENTIAL | PARALLEL | SINGLE_ACTIONS
  rollupProgress   Float?         @map("rollup_progress")
  rollupStatus     ProjectStatus? @map("rollup_status")
}
```

**Task fields relevant to outline rendering:**
```prisma
model Task {
  id              String        @id @default(cuid())
  title           String
  status          TaskStatus    // NOT_STARTED | IN_PROGRESS | WAITING | COMPLETED | DROPPED
  isNextAction    Boolean       @default(false)
  sortOrder       Int           @default(0)
  contextId       String?
  context         Context?      @relation(fields: [contextId], references: [id], onDelete: SetNull)
  projectId       String?
  estimatedMins   Int?
  energyLevel     EnergyLevel?  // LOW | MEDIUM | HIGH
  dueDate         DateTime?
}
```

**Contexts** (GTD `@home`, `@office`, etc.):
```prisma
model Context {
  id        String  @id @default(cuid())
  name      String
  color     String?
  icon      String?
}
```

### 2.2 Schema Addition: Gantt Toggle

One new field on `ServerSettings`:

```prisma
model ServerSettings {
  // ... existing fields ...
  ganttEnabled  Boolean @default(true)
}
```

**Migration:** Single `ALTER TABLE` adding a boolean column with default `true`. Non-breaking — existing deployments keep Gantt enabled.

---

## 3. API Design

### 3.1 Existing Endpoints (No Changes)

| Endpoint | Returns | Used By |
|----------|---------|---------|
| `GET /api/projects/[id]` | Project with `tasks[]`, `childProjects[]` | Per-Project Outline |
| `GET /api/projects/[id]/tree` | Nested tree with `taskCounts`, rollups | Per-Project Outline (tree sidebar) |
| `GET /api/projects` | All root projects with `taskCounts` | Master Project View (project list) |
| `GET /api/contexts` | All contexts | Context badges |
| `GET /api/admin/settings` | `ServerSettings` singleton | Gantt toggle check |
| `PATCH /api/admin/settings` | Updated settings | Admin toggle |

### 3.2 New Endpoint: Master Project Outline

```
GET /api/projects/outline
```

Returns all active projects as a tree, each with their tasks included. This avoids N+1 requests when rendering the master view.

**Response shape:**
```typescript
interface OutlineProject {
  id: string;
  title: string;
  status: ProjectStatus;
  type: ProjectType;         // Controls section header (Sequential/Parallel/Single)
  depth: number;
  rollupProgress: number | null;
  rollupStatus: ProjectStatus | null;
  area: { id: string; name: string } | null;
  tasks: OutlineTask[];
  childProjects: OutlineProject[];  // Recursive nesting
}

interface OutlineTask {
  id: string;
  title: string;
  status: TaskStatus;
  isNextAction: boolean;
  sortOrder: number;
  context: { id: string; name: string; color: string | null } | null;
  estimatedMins: number | null;
  energyLevel: EnergyLevel | null;
  dueDate: string | null;
}
```

**Query strategy:**
```typescript
// Single query: all active root projects with 2 levels of children + tasks at each level
const projects = await prisma.project.findMany({
  where: {
    userId,
    depth: 0,
    status: { in: ["ACTIVE", "ON_HOLD"] },
  },
  include: {
    area: { select: { id: true, name: true } },
    tasks: {
      where: { status: { notIn: ["COMPLETED", "DROPPED"] } },
      orderBy: [{ isNextAction: "desc" }, { sortOrder: "asc" }],
      include: { context: { select: { id: true, name: true, color: true } } },
    },
    childProjects: {
      include: {
        tasks: {
          where: { status: { notIn: ["COMPLETED", "DROPPED"] } },
          orderBy: [{ isNextAction: "desc" }, { sortOrder: "asc" }],
          include: { context: { select: { id: true, name: true, color: true } } },
        },
        childProjects: {
          include: {
            tasks: {
              where: { status: { notIn: ["COMPLETED", "DROPPED"] } },
              orderBy: [{ isNextAction: "desc" }, { sortOrder: "asc" }],
              include: { context: { select: { id: true, name: true, color: true } } },
            },
          },
        },
      },
    },
  },
  orderBy: { sortOrder: "asc" },
});
```

This is a single Prisma query (2-3 JOINs) rather than N+1 fetches. With max depth 2, the nesting is bounded and predictable.

**Query params:**
- `?status=ACTIVE,ON_HOLD` — Filter by project status (default: active + on hold)
- `?areaId=xxx` — Filter by area
- `?includeDone=true` — Include completed/dropped tasks (default: false, only active tasks)

### 3.3 Gantt Toggle on Settings

The existing `PATCH /api/admin/settings` already accepts arbitrary `ServerSettings` fields. Adding `ganttEnabled` requires:

1. Add field to Prisma schema
2. Add to the settings PATCH validation schema (Zod)
3. Frontend reads `ganttEnabled` from settings and conditionally renders

No new endpoint needed.

---

## 4. Component Design

### 4.1 ProjectOutlineView (Per-Project Enhancement)

**Replaces:** The current flat link list of sub-projects on `/projects/[id]`
**Location:** `src/components/projects/ProjectOutlineView.tsx`

This component renders inline on the existing project detail page. Instead of navigating away to see a sub-project's tasks, they appear right here.

```typescript
interface ProjectOutlineViewProps {
  project: ProjectDetail;           // Existing interface from page.tsx
  contexts: { id: string; name: string; color: string | null }[];
  onCompleteTask: (taskId: string) => Promise<void>;
  onAddTask: (title: string, projectId: string) => Promise<void>;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
}
```

**Rendered structure:**

```
▼ Sub-Project: Auth System                    Sequential  [=====>    ] 52%
    ☑ Set up NextAuth providers               @computer
    ★ Implement session middleware             @computer    30m
      Add role-based route guards             @computer    45m
      Write auth integration tests            @computer    60m

▶ Sub-Project: API Layer                      Parallel    [=>        ] 12%

▶ Sub-Project: Dashboard                      Parallel    [          ]  0%
```

**Behavior:**
- Each sub-project is a **collapsible section** (default: collapsed)
- Section header shows: title, processing type badge, progress bar, status dot, task count
- Expanded section shows tasks inline using the existing `ProjectTaskItem` component
- Tasks respect the sub-project's processing type for next-action display
- Inline "Add task" input at the bottom of each expanded section
- Click the sub-project title to navigate to its full detail page (for editing outcome, description, etc.)
- Tasks are fully interactive: checkbox to complete (triggers cascade), inline edit, context badge

### 4.2 MasterProjectView (New Top-Level Page)

**Route:** `/projects/outline`
**Location:** `src/app/(dashboard)/projects/outline/page.tsx`
**Component:** `src/components/projects/MasterProjectView.tsx`

The "everything in one place" view. Shows ALL active projects as an expandable outline.

```typescript
interface MasterProjectViewProps {
  // Data fetched from GET /api/projects/outline
  projects: OutlineProject[];
  contexts: { id: string; name: string; color: string | null }[];
}
```

**Rendered structure (fully expanded):**

```
▼ Build Tandem v2                              Sequential  [========> ] 72%  @Work
  │
  ├─ ▼ Cascade Engine                         Sequential  [==========] 100%
  │     ☑ Implement next-action promotion      @computer
  │     ☑ Add cross-project dependencies       @computer
  │     ☑ Write cascade unit tests             @computer
  │
  ├─ ▼ Auth System                            Sequential  [=====>    ] 52%
  │     ☑ Set up NextAuth providers            @computer
  │     ★ Implement session middleware         @computer    30m
  │       Add role-based route guards          @computer    45m
  │
  └─ ▶ Dashboard Views                        Parallel    [=>        ] 12%

▼ Home Renovation                              Parallel    [===>      ] 35%
    ★ Get quotes from contractors              @phone       15m
    ★ Order kitchen tile samples               @errands
    ★ Research permit requirements             @computer    45m

▶ Quarterly Tax Prep                           Sequential  [          ]  0%

▶ Learn Rust                                   Sequential  [=>        ] 15%   Someday
```

**Collapsed view (default state):**

```
▶ Build Tandem v2                              Sequential  [========> ] 72%   3 sub  12 tasks
▶ Home Renovation                              Parallel    [===>      ] 35%           3 tasks
▶ Quarterly Tax Prep                           Sequential  [          ]  0%           5 tasks
▶ Learn Rust                                   Sequential  [=>        ] 15%           8 tasks
```

**Task detail shown per row:**
| Element | Description | Always Visible |
|---------|-------------|----------------|
| Checkbox | Complete task (triggers cascade) | Yes |
| Next-action star (★) | Yellow star if `isNextAction === true` | Yes |
| Title | Task title, inline editable | Yes |
| Context badge | Colored pill with context name (@home, etc.) | If set |
| Estimated time | `30m`, `1h 15m` etc. | If set |
| Due date | Red if overdue, muted if future | If set |
| Energy level | Low/Med/High indicator | If set |

**Section header (per project / sub-project):**
| Element | Description |
|---------|-------------|
| Expand/collapse chevron | Toggle children visibility |
| Project title | Clickable — navigates to project detail page |
| Processing type badge | `Sequential` / `Parallel` / `Single Actions` with icon |
| Progress bar | Thin inline bar showing completion % |
| Status dot | Green (active), yellow (on hold), blue (complete), gray (dropped) |
| Summary counts (collapsed) | `3 sub  12 tasks` — sub-project and task counts |

### 4.3 Component Reuse

The outline views should reuse existing components:

| Existing Component | Used For |
|-------------------|----------|
| `ProjectTaskItem` | Task rows (checkbox, star, context badge, inline edit) |
| `ProjectStatusChanger` | Status dots and dropdowns |
| Badge (shadcn) | Processing type, context, status |

New components to create:

| New Component | Purpose |
|--------------|---------|
| `OutlineSection` | Collapsible project section with header + task list |
| `MasterProjectView` | Top-level outline page component |
| `ProjectOutlineView` | Inline outline for project detail page |

---

## 5. UX Behavior

### 5.1 Expand / Collapse

- **Default state:** All projects collapsed in Master View; sub-projects collapsed on project detail
- **Persist state:** Expansion state stored in `localStorage` keyed by `outline-expanded-{projectId}`
- **Expand all / Collapse all:** Button in the Master View toolbar
- **Keyboard:** `Enter` or `Space` on a focused section header toggles it
- **Animation:** Height transition with `overflow-hidden` — keep it fast (150ms)

### 5.2 What's Shown Collapsed vs Expanded

| State | Shows |
|-------|-------|
| **Collapsed** | Project title, type badge, progress bar, status dot, summary counts |
| **Expanded** | All of the above + full task list with interactive items + nested sub-projects |

### 5.3 Mutations (Inline Actions)

All mutations happen inline without page navigation:

| Action | Trigger | API Call | Post-Action |
|--------|---------|----------|-------------|
| Complete task | Click checkbox | `POST /api/tasks/[id]/complete` | Refetch outline data; show toast if cascade promoted tasks or completed projects |
| Add task | Type in inline input, press Enter | `POST /api/projects/[id]/tasks` | Refetch; new task appears in correct position |
| Edit task title | Click title, edit inline | `PATCH /api/tasks` | Optimistic update |
| Toggle next-action | Click star | `PATCH /api/tasks` | Optimistic update |
| Navigate to project | Click project title in header | Client-side navigation | Full project detail page |

### 5.4 Empty States

- **Project with no tasks:** Show "No active tasks" with inline add input
- **Project with no sub-projects:** Just show tasks (no sub-project section)
- **Master view with no projects:** "No active projects. Create one to get started."
- **All tasks completed:** Show completion message with confetti animation (kidding — just a green check)

---

## 6. Gantt Admin Toggle

### 6.1 Data

```prisma
model ServerSettings {
  ganttEnabled  Boolean @default(true)
}
```

### 6.2 Admin UI

On the existing admin settings page (`/admin/settings`), add a toggle in a "Features" section:

```
Features
─────────────────────────────────
Gantt Chart View          [ON/OFF toggle]
Visual project timeline with dependencies,
critical path, and baseline snapshots.
```

Calls `PATCH /api/admin/settings` with `{ ganttEnabled: true/false }`.

### 6.3 Frontend Behavior When Gantt Disabled

| Location | Current | When `ganttEnabled = false` |
|----------|---------|---------------------------|
| `ProjectHeader` (line 242-249) | Shows "Gantt" button linking to `/projects/[id]/gantt` | Button hidden — don't pass `ganttHref` prop |
| `/projects/[id]/gantt` page | Renders `GanttView` | Redirect to `/projects/[id]` or show "Feature disabled" |
| Navigation/sidebar | (if any Gantt links) | Hidden |

**Implementation approach:** The project detail page already fetches settings context. Add `ganttEnabled` to the app's settings context/provider. `ProjectHeader` checks it before rendering the Gantt button:

```tsx
// In ProjectDetailPage, conditionally pass ganttHref:
<ProjectHeader
  ganttHref={settings.ganttEnabled ? `/projects/${projectId}/gantt` : undefined}
  // ...
/>
```

The `ProjectHeader` already handles `ganttHref` being undefined — the button simply doesn't render (line 242: `{ganttHref && (...)}`).

---

## 7. Implementation Phases

### Phase 1: Gantt Toggle (Small, Standalone)
**Scope:** Schema migration, admin UI toggle, conditional Gantt button
**Files touched:**
- `prisma/schema.prisma` — Add `ganttEnabled` field
- `src/app/api/admin/settings/route.ts` — Already handles arbitrary settings fields
- `src/lib/validations/settings.ts` — Add to Zod schema (if validation exists)
- Admin settings page — Add toggle row
- `src/app/(dashboard)/projects/[id]/page.tsx` — Pass `ganttHref` conditionally based on settings
- `src/app/(dashboard)/projects/[id]/gantt/page.tsx` — Guard route when disabled

**Estimated scope:** ~5 files, minimal risk

### Phase 2: Per-Project Outline View
**Scope:** Replace flat sub-project links with inline outline on project detail page
**Files touched:**
- `src/components/projects/OutlineSection.tsx` — New: collapsible section with tasks
- `src/components/projects/ProjectOutlineView.tsx` — New: orchestrates outline sections
- `src/app/(dashboard)/projects/[id]/page.tsx` — Replace sub-projects section with `ProjectOutlineView`
- `src/app/api/projects/[id]/route.ts` — May need to include nested task data for sub-projects (currently only returns `childProjects` without their tasks)

**Key decision:** The existing `GET /api/projects/[id]` returns `childProjects` as `{ id, title, status, type, rollupProgress }` — no tasks. Two options:
  - **Option A:** Extend the existing endpoint to include `childProjects[].tasks[]` when a `?include=outline` query param is passed
  - **Option B:** Have the frontend fetch each sub-project's tasks separately (N+1, but simpler)
  - **Recommended:** Option A. The depth is bounded at 2, so the query is predictable.

**Estimated scope:** ~4 files, 2 new components

### Phase 3: Master Project View
**Scope:** New page + API endpoint showing all projects as expandable outline
**Files touched:**
- `src/app/api/projects/outline/route.ts` — New endpoint
- `src/components/projects/MasterProjectView.tsx` — New page component
- `src/app/(dashboard)/projects/outline/page.tsx` — New route page
- Sidebar/navigation — Add "Outline" or "All Projects" link

**Dependencies:** Reuses `OutlineSection` from Phase 2

**Estimated scope:** ~4 files, 1 new component (reuses Phase 2 components)

### Phase 4: Polish & Performance
**Scope:** localStorage expansion persistence, keyboard navigation, optimistic updates, loading skeletons
- Expansion state persistence in `localStorage`
- Skeleton loading states for outline sections
- Keyboard shortcuts (expand/collapse with arrow keys)
- Optimistic task completion (update UI before API response)
- Consider virtualization if project count exceeds ~100 (unlikely for most users)

---

## 8. What This Spec Does NOT Cover

- **Drag-and-drop reordering** of tasks or projects in the outline (future enhancement)
- **Filtering the outline** by context, energy level, or due date (future enhancement — valuable, but separate spec)
- **Bulk operations** (select multiple tasks, batch complete/move)
- **Removing Gantt code entirely** — the toggle just hides it; the code stays for teams that want it
- **Mobile responsive layout** — the outline should work on mobile but detailed mobile UX is out of scope
- **Real-time sync** — outline data is fetched on page load and after mutations; no WebSocket push

---

## 9. Open Questions

1. **Master View navigation placement:** Should "Outline" be a top-level sidebar item, or a tab on the existing `/projects` page?
2. **Completed tasks in outline:** Show them collapsed at the bottom of each section (current ProjectTaskList behavior), or hide entirely with a "show completed" toggle?
3. **Someday/Maybe projects:** Include in master outline with a visual indicator, or exclude entirely?
