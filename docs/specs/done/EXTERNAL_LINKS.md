# Tandem Feature Spec: External Links on Tasks & Projects

**Version:** 1.0  
**Date:** March 10, 2026  
**Author:** Jason Courtemanche  
**Status:** Implementation-Ready

---

## 1. Summary

Tasks and projects can each store a single external link — a URL and an optional display label. When set, the link renders as a one-click button that opens the target in a new tab. The primary use case is linking to a Google Drive document, folder, or sheet, but the field accepts any valid URL (Notion pages, Figma files, GitHub repos, etc.).

This keeps reference material close to the work without pulling that material into Tandem itself, which aligns with GTD's distinction between the *action* (in Tandem) and the *reference* (wherever it lives).

---

## 2. Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| One link or many? | **One per entity (v1)** | Covers 90% of real use. Multiple links adds UI complexity; the notes field + wiki links serve additional references. |
| URL + label or URL only? | **URL + optional label** | "Q3 Budget Sheet" is more scannable than a Drive URL. If no label is provided, a smart default is derived from the URL hostname (e.g. "docs.google.com → Google Drive"). |
| Where in the UI? | Task: **expanded card section**. Project: **ProjectHeader below outcome** | Consistent with how other task metadata is surfaced; keeps the collapsed card view uncluttered. |
| Link opens in...? | **New tab** (`target="_blank" rel="noopener noreferrer"`) | Standard for external links; user doesn't lose their place in Tandem. |
| Validation? | **Client + server: valid URL format, label ≤ 100 chars** | Prevents broken links; label length keeps the button readable. |
| MCP exposure? | **Yes — read and write** | AI assistants should be able to attach and retrieve reference links. |

---

## 3. Schema Changes

Both changes are **non-breaking** — nullable fields with no defaults, so all existing rows are unaffected and no data migration is required.

```prisma
model Task {
  // ... existing fields ...

  // NEW
  externalLinkUrl    String? @map("external_link_url")
  externalLinkLabel  String? @map("external_link_label")
}

model Project {
  // ... existing fields ...

  // NEW
  externalLinkUrl    String? @map("external_link_url")
  externalLinkLabel  String? @map("external_link_label")
}
```

**Migration:**

```sql
ALTER TABLE tasks
  ADD COLUMN external_link_url   TEXT,
  ADD COLUMN external_link_label TEXT;

ALTER TABLE projects
  ADD COLUMN external_link_url   TEXT,
  ADD COLUMN external_link_label TEXT;
```

---

## 4. API Changes

### 4.1 Task Endpoints

**`PATCH /api/tasks/:id`** — extend `updateTaskSchema`:

```typescript
// src/lib/validations/task.ts
export const updateTaskSchema = z.object({
  // ... existing fields ...
  externalLinkUrl:   z.string().url().nullable().optional(),
  externalLinkLabel: z.string().max(100).nullable().optional(),
});
```

Both fields are included in all task `GET` responses going forward (`/api/tasks`, `/api/tasks/:id`, `/api/projects/:id/tasks`).

To **clear** a link, send `{ externalLinkUrl: null, externalLinkLabel: null }`.

### 4.2 Project Endpoints

**`PATCH /api/projects/:id`** — extend `updateProjectSchema`:

```typescript
// src/lib/validations/project.ts
export const updateProjectSchema = z.object({
  // ... existing fields ...
  externalLinkUrl:   z.string().url().nullable().optional(),
  externalLinkLabel: z.string().max(100).nullable().optional(),
});
```

Both fields included in all project `GET` responses.

---

## 5. UI: Task Cards

The external link field lives in the **expanded section** of both `TaskCard.tsx` (Do Now / context views) and `ProjectTaskItem.tsx` (project task list). It renders below the notes field and above the metadata grid.

### 5.1 States

**No link set — add prompt:**
```
[ 🔗 Add link ]   ← ghost button / subtle text link
```
Clicking opens an inline edit row (see below).

**Link set — rendered as button:**
```
[ 🔗  Q3 Budget Sheet  ↗ ]   ← full-width outlined button, opens new tab
                  [ × ]       ← small clear button on the right
```

**Inline edit mode** (triggered by clicking "Add link" or the link button itself):
```
Label (optional)          URL
[ Q3 Budget Sheet      ]  [ https://docs.google.com/...  ]  [Save] [Cancel]
```
- URL field is validated on blur and on save. An invalid URL shows an inline error: "Please enter a valid URL (include https://)."
- Label field is optional. If empty, a smart default label is derived:

```typescript
function deriveLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const knownHosts: Record<string, string> = {
      "docs.google.com":  "Google Drive",
      "drive.google.com": "Google Drive",
      "sheets.google.com": "Google Sheets",
      "notion.so":        "Notion",
      "figma.com":        "Figma",
      "github.com":       "GitHub",
      "linear.app":       "Linear",
    };
    return knownHosts[host] ?? host;
  } catch {
    return "External Link";
  }
}
```

- Save is on button click or `Enter` in either field. Cancel is `Escape` or the Cancel button — reverts to prior state.
- Autosave on blur is **not** used here (unlike notes) because both fields need to be valid together before saving.

### 5.2 Placement in Expanded Section

```
[ Notes textarea / display ]

[ 🔗 Add link ]  ←— new row here

[ Context ]  [ Energy ]   ← existing metadata grid
[ Time Est ] [ Due Date ]
```

---

## 6. UI: Projects

The external link field lives in `ProjectHeader.tsx`, below the outcome field and above the task list / tabs.

### 6.1 States

Follows the same three states as the task card (no link → add prompt; link set → button; inline edit mode), with the same `deriveLabel` logic.

**Link set — rendered in project header:**
```
[ 🔗  Project Brief  ↗ ]   [ × ]
```
The button uses `variant="outline"` and `size="sm"` to match the existing badge row style.

**Inline edit mode** — appears inline below the outcome, same two-field row as tasks.

### 6.2 Placement in ProjectHeader

```
[Project Title]  [Status badge]  [Area badge]  [Goal badge]

Outcome: What does 'done' look like?   ← existing

[ 🔗  Add link ]                       ← new row

[Task tabs / task list]                ← existing
```

---

## 7. Shared Component: `ExternalLinkField`

Because the behavior is identical on tasks and projects, extract a reusable component:

```
src/components/shared/ExternalLinkField.tsx
```

**Props:**

```typescript
interface ExternalLinkFieldProps {
  url:      string | null;
  label:    string | null;
  onSave:   (url: string | null, label: string | null) => Promise<void>;
  size?:    "sm" | "default";  // "sm" for task cards, "default" for project header
}
```

**Internal state:** `mode: "display" | "editing"` — no prop-drilling of edit state needed.

---

## 8. MCP Server Changes

### 8.1 `tandem_task_list` / task read tools

Include `externalLinkUrl` and `externalLinkLabel` in all task response objects.

### 8.2 `tandem_task_update`

Add to input schema:

```typescript
{
  externalLinkUrl:   { type: "string", description: "Full URL (include https://). Set to null to clear." },
  externalLinkLabel: { type: "string", description: "Display label, e.g. 'Project Brief'. Optional — defaults to hostname." },
}
```

### 8.3 `tandem_project_list` / project read tools

Include `externalLinkUrl` and `externalLinkLabel` in all project response objects.

### 8.4 `tandem_project_update` (or equivalent)

Same two fields added to input schema as above.

**Example MCP use case:** User tells Claude "link the Tandem Roadmap task to this Google Sheet URL" — Claude calls `tandem_task_update` with the URL and a label.

---

## 9. Open Questions Resolved

| Question | Resolution |
|---|---|
| Should clicking the existing link open edit mode? | **Yes** — clicking the rendered link button enters edit mode (same as clicking a task title to rename). The external `↗` icon in the top-right corner is the actual "open" action; clicking the label text enters edit. This follows the existing pattern on task titles. |
| What if the URL is a Drive *file* vs. a Drive *folder*? | No distinction needed — both are valid URLs and render identically. The label field is where the user communicates the difference. |
| Should the field be searchable / filterable? | **No for v1.** A "has external link" filter is a reasonable v1.1 addition but not needed at launch. |
| Expose in weekly review? | **No** — the weekly review surfaces task/project metadata for review decisions; external links are reference pointers, not review criteria. |

---

## 10. Files to Create / Modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `externalLinkUrl` + `externalLinkLabel` to `Task` and `Project` models |
| `prisma/migrations/YYYYMMDD_add_external_links/migration.sql` | Two `ALTER TABLE` statements |
| `src/lib/validations/task.ts` | Add two optional nullable fields to `updateTaskSchema` |
| `src/lib/validations/project.ts` | Add two optional nullable fields to `updateProjectSchema` |
| `src/components/shared/ExternalLinkField.tsx` | **New** — shared component (see §7) |
| `src/components/tasks/TaskCard.tsx` | Add `<ExternalLinkField>` in expanded section |
| `src/components/projects/ProjectTaskItem.tsx` | Add `<ExternalLinkField>` in expanded section |
| `src/components/projects/ProjectHeader.tsx` | Add `<ExternalLinkField>` below outcome |
| `src/app/api/tasks/[id]/route.ts` | Include new fields in GET response; handle in PATCH |
| `src/app/api/projects/[id]/route.ts` | Include new fields in GET response; handle in PATCH |
| `src/mcp/tools.ts` | Add fields to task/project input schemas and response shapes |

---

## 11. Scope Boundaries

**In scope (v1.0):**
- One link per task, one link per project
- URL + optional label
- Full CRUD (add, edit, clear) from both task cards and project header
- MCP read and write

**Out of scope (explicitly deferred):**
- Multiple links per entity
- "Has external link" filter
- Link preview / unfurl (og:title, favicon)
- Automatic link detection from pasted notes
- Link health checking (broken URL detection)
