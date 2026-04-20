# Template Enhancement — Team Templates, Editing & Visibility

**Date:** March 27, 2026
**Status:** Spec

---

## Problem

Templates today are either system (shipped, read-only) or personal (save-and-forget). There's no way for teams to build reusable templates from real projects they've run. No way to edit a template once created. No way for users to hide templates they don't use. No admin UI for managing system templates.

## Goal

Three tiers of templates that teams actually use and improve over time:

| Level | Owner | Who can use | Who can edit | Who can hide |
|---|---|---|---|---|
| **System** | Platform | All users | App admin | Admin (globally) or user (personally) |
| **Team** | Team | Team members | Team admins | Team members (personally) |
| **Personal** | User | Owner only | Owner | Owner (just delete it) |

---

## Phase 1 — Team Templates & Three-Tier Library

The smallest useful increment: teams can save a project as a team template, and any team member can create projects from it.

### Schema Changes

**Migration:** `add_team_templates_and_hidden`

Add to `ProjectTemplate`:
```prisma
teamId           String?
team             Team?    @relation(fields: [teamId], references: [id], onDelete: Cascade)
isGloballyHidden Boolean  @default(false)

hiddenBy         HiddenTemplate[]

@@index([teamId])
```

New model:
```prisma
model HiddenTemplate {
  id         String          @id @default(cuid())
  userId     String
  user       User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  templateId String
  template   ProjectTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  hiddenAt   DateTime        @default(now())

  @@unique([userId, templateId])
  @@index([userId])
}
```

Add relations on `Team` (`templates ProjectTemplate[]`) and `User` (`hiddenTemplates HiddenTemplate[]`).

**Ownership rules:**

| Level | `isSystem` | `userId` | `teamId` |
|---|---|---|---|
| System | true | null | null |
| Team | false | null | set |
| Personal | false | set | null |

### API Changes

**`GET /api/project-templates`** — expand query:
```
WHERE (isSystem = true AND isGloballyHidden = false)
   OR userId = {current}
   OR teamId IN {user's team IDs}
```
Filter out user's `HiddenTemplate` records. Add `ownership` ("system" | "team" | "personal") and `teamName` to response.

**`GET /api/project-templates/[id]`** — allow team members:
- System: allow all
- Personal: owner only
- Team: any member of `template.teamId`

**`DELETE /api/project-templates/[id]`** — expand auth:
- Personal: owner
- Team: team ADMIN role
- System: app admin (remove current hard block)

**`POST /api/project-templates/[id]/instantiate`** — same access check as GET.

**`POST /api/projects/[id]/save-as-template`** — add optional `teamId` to schema. When set, verify user is a member of that team, then save with `teamId` set and `userId` null.

### Service Changes (`template-service.ts`)

- `instantiateTemplate()`: update access check to allow team members
- `saveProjectAsTemplate()`: accept `teamId` param; when set, create as team template

### UI Changes

**`SaveAsTemplateDialog.tsx`** — add "Save for" picker:
- "Just me" (default)
- List of user's teams (fetched from `/api/teams`)
- Pre-select the project's team if it has one

**`TemplateLibrary.tsx`** — three sections:
1. **My Templates** — personal, with delete action
2. **Team Templates** — grouped by team name, with team badge
3. **System Templates** — shipped defaults

**`TemplateCard.tsx`** — show team badge (icon + name) for team templates.

**MCP `tandem_project_create_from_template`** — include team templates in listing, add `teamName` to output.

### Edge Cases
- **Team member leaves:** loses access to team templates; existing projects unaffected
- **Team deleted:** `onDelete: Cascade` removes team templates; existing projects unaffected
- **Save-as-template for team project:** pre-select that team in the picker

---

## Phase 2 — Template Editing & Hide/Show

Users can improve templates over time. Users can declutter by hiding templates they don't need.

### API Changes

**New `PUT /api/project-templates/[id]`** — edit a template:
- Auth: personal → owner; team → team ADMIN; system → app admin
- Accept full template payload (title, description, type, tasks, sub-projects)
- Strategy: update template fields, delete all child records, recreate from payload
- Validation: new `updateProjectTemplateSchema`

**New `POST /api/project-templates/[id]/hide`** — hide a system or team template for this user. Creates `HiddenTemplate` record.

**New `DELETE /api/project-templates/[id]/hide`** — unhide. Removes the `HiddenTemplate` record.

### Service Changes

- New `updateTemplate(templateId, data)` — replace-all update of template + children
- New `canEditTemplate(userId, template)` — authorization helper

### Validation Changes

New `updateProjectTemplateSchema`:
```typescript
{
  title: string (1-200),
  description: string (max 2000) optional,
  type: enum optional,
  outcome: string optional,
  icon: string optional,
  variables: string[] optional,
  taskTemplates: [{ title, notes, estimatedMins, energyLevel, contextName, sortOrder }],
  subProjectTemplates: [{ title, type, outcome, sortOrder, tasks: [...] }]
}
```

### UI Changes

**New `TemplateEditor.tsx`** — full template editor dialog:
- Header: title, description, type, outcome, icon, variables
- Task list: add/remove/reorder tasks; each row has title + expandable detail (notes, time, energy, context)
- Sub-project list: each with its own task list
- Save button → `PUT /api/project-templates/[id]`

**`TemplateLibrary.tsx`** additions:
- Edit button (pencil icon) on editable templates
- Hide button (eye-off icon) on system and team templates
- "Show hidden" toggle that reveals hidden templates (greyed out) with unhide action

**`TemplateCard.tsx`** additions:
- `onEdit`, `onHide`, `onUnhide` callbacks
- `canEdit`, `isHidden` props
- Visual affordances: edit pencil, hide eye-off (on hover, like existing delete)

---

## Phase 3 — Admin Template Management

Admins manage system templates from the settings UI.

### API Changes

**`GET /api/admin/templates`** — list all system templates (including globally hidden). Uses `requireAdmin()`.

**`PUT /api/admin/templates/[id]/visibility`** — toggle `isGloballyHidden`. Body: `{ hidden: boolean }`.

**`POST /api/admin/templates`** — create new system template from admin UI. Sets `isSystem: true`.

### UI Changes

**New `TemplatesManagement.tsx`** — admin settings tab:
- Table of system templates with columns: title, type, task count, visibility toggle (Switch component)
- "New System Template" button → opens `TemplateEditor` in create mode
- Edit button → opens `TemplateEditor` for that template
- Delete button with confirmation

**Admin settings page** — add "Templates" tab alongside existing tabs.

---

## Files to Modify

### Schema & Migration
- `prisma/schema.prisma` — ProjectTemplate fields, HiddenTemplate model, Team/User relations

### API Routes
- `src/app/api/project-templates/route.ts` — GET query expansion
- `src/app/api/project-templates/[id]/route.ts` — GET/DELETE/PUT auth + edit endpoint
- `src/app/api/project-templates/[id]/instantiate/route.ts` — access check
- `src/app/api/projects/[id]/save-as-template/route.ts` — teamId support
- `src/app/api/project-templates/[id]/hide/route.ts` — new (Phase 2)
- `src/app/api/admin/templates/route.ts` — new (Phase 3)
- `src/app/api/admin/templates/[id]/visibility/route.ts` — new (Phase 3)

### Service & Validation
- `src/lib/services/template-service.ts` — team access, updateTemplate, canEditTemplate
- `src/lib/validations/project-template.ts` — updateProjectTemplateSchema, teamId on save

### UI Components
- `src/components/projects/SaveAsTemplateDialog.tsx` — team picker
- `src/components/projects/TemplateLibrary.tsx` — three sections, hide/edit actions
- `src/components/projects/TemplateCard.tsx` — team badge, edit/hide affordances
- `src/components/projects/InstantiateTemplateDialog.tsx` — pre-select team
- `src/components/projects/TemplateEditor.tsx` — new (Phase 2)
- `src/components/admin/TemplatesManagement.tsx` — new (Phase 3)

### MCP
- `src/mcp/tools.ts` — tandem_project_create_from_template query + output

---

## Verification

### Phase 1
1. Save a project as a team template → appears in team member's template library
2. Team member creates project from team template → works
3. Non-member cannot see or use team template
4. Personal templates still work as before
5. MCP tool lists team templates with team name

### Phase 2
1. Edit a personal template (change title, add/remove tasks) → changes persist
2. Edit a team template as team admin → works; as team member → blocked
3. Hide a system template → disappears from library
4. Toggle "show hidden" → see hidden templates greyed out, can unhide

### Phase 3
1. Admin creates system template from settings → available to all users
2. Admin hides system template → disappears for all users
3. Admin edits system template → changes visible to all users
