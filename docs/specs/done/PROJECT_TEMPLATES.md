# Project Templates

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Many projects follow the same structure every time they happen. Planning a trip involves the same categories of tasks (book flights, arrange accommodation, pack, etc.). Hiring someone follows a predictable checklist. Weekly grocery shopping is the same list with minor variations.

Currently, users create these structures from scratch every time, or they keep a mental checklist and hope they don't forget a step. The "Save as Template" pattern is common in project management tools for good reason -- it captures institutional knowledge and reduces setup friction.

Tandem already has a precedent for template-like functionality: `RecurringTemplate` generates tasks from a template on a schedule. Project templates extend this idea to whole project structures -- a project plus its tasks, plus optionally sub-projects, all instantiable with one click.

### What "Done" Looks Like

1. **Template library** -- users see a set of built-in system templates ("Plan a Trip", "Hire Someone", etc.) and any personal templates they've saved.
2. **Create from template** -- from the "New Project" dialog, users pick a template. It creates a real Project with pre-populated tasks. Variable placeholders like `{destination}` in task titles get prompted.
3. **Save as template** -- from any existing project, users can "Save as Template" to capture the project structure and task titles as a reusable template.
4. **System templates** -- ship with the app (seeded like help docs). Cover common GTD/life workflows.
5. **MCP tool** -- `tandem_project_create_from_template` lets AI assistants instantiate project templates.

### Design Constraints

- Follow the `RecurringTemplate` pattern for model structure
- Follow the `HelpArticle` seed pattern for system templates (seed from files, source hash for update detection)
- The existing `createProject` and `createTask` service functions handle history events -- template instantiation should use them rather than raw Prisma calls

---

## 2. Data Model

### 2.1 ProjectTemplate

```prisma
model ProjectTemplate {
  id          String      @id @default(cuid())
  title       String                          // "Plan a Trip"
  description String?     @db.Text            // Description shown in template library
  type        ProjectType @default(SEQUENTIAL) // Project type when instantiated
  outcome     String?                          // Default outcome statement
  icon        String?                          // Lucide icon name for display

  // System template tracking (same pattern as HelpArticle)
  isSystem    Boolean     @default(false)      // True for shipped templates
  sourceFile  String?     @unique              // File path for system templates
  sourceHash  String?                          // SHA-256 of source file

  // User ownership (null for system templates)
  userId      String?
  user        User?       @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Variable placeholders (e.g., ["destination", "travel_dates"])
  variables   String[]

  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  taskTemplates    ProjectTaskTemplate[]
  subProjectTemplates ProjectSubTemplate[]

  @@index([userId])
  @@index([isSystem])
}
```

### 2.2 ProjectTaskTemplate

```prisma
model ProjectTaskTemplate {
  id            String       @id @default(cuid())
  title         String                          // May contain variables: "Book flights to {destination}"
  notes         String?      @db.Text
  estimatedMins Int?
  energyLevel   EnergyLevel?
  sortOrder     Int          @default(0)

  // Context is stored by name (not ID) for portability across users
  contextName   String?                         // "@Computer", "@Phone", etc.

  templateId    String
  template      ProjectTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  // Optional: which sub-project this task belongs to (null = top-level project)
  subProjectTemplateId String? @map("sub_project_template_id")
  subProjectTemplate   ProjectSubTemplate? @relation(fields: [subProjectTemplateId], references: [id], onDelete: SetNull)

  @@index([templateId])
  @@index([subProjectTemplateId])
}
```

### 2.3 ProjectSubTemplate

For templates that include sub-projects (e.g., "Launch a Product" with "Marketing", "Engineering", "Legal" sub-projects):

```prisma
model ProjectSubTemplate {
  id          String      @id @default(cuid())
  title       String                            // "Marketing Launch Tasks"
  type        ProjectType @default(SEQUENTIAL)
  outcome     String?
  sortOrder   Int         @default(0)

  templateId  String
  template    ProjectTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  tasks       ProjectTaskTemplate[]

  @@index([templateId])
}
```

### 2.4 User Relation Update

Add to the `User` model:

```prisma
// In model User
projectTemplates ProjectTemplate[]
```

---

## 3. System Templates

### 3.1 Template Source Files

System templates are defined as YAML files in the repo:

```
docs/templates/
  plan-a-trip.yaml
  hire-someone.yaml
  launch-a-product.yaml
  move-apartments.yaml
  weekly-grocery-run.yaml
```

### 3.2 YAML Format

```yaml
# docs/templates/plan-a-trip.yaml
title: Plan a Trip
description: >
  Everything you need to organize a trip, from booking flights to packing.
  Works for vacations, business travel, or weekend getaways.
type: SEQUENTIAL
outcome: "Trip to {destination} is fully planned and booked"
icon: plane
variables:
  - destination
  - travel_dates

tasks:
  - title: "Research {destination} — flights, accommodation, activities"
    notes: "Compare options, read reviews, check visa requirements"
    estimatedMins: 60
    energyLevel: HIGH
    contextName: "@Computer"

  - title: "Book flights to {destination}"
    estimatedMins: 30
    energyLevel: MEDIUM
    contextName: "@Computer"

  - title: "Book accommodation for {travel_dates}"
    estimatedMins: 30
    energyLevel: MEDIUM
    contextName: "@Computer"

  - title: "Plan itinerary — daily activities and reservations"
    estimatedMins: 45
    energyLevel: HIGH
    contextName: "@Computer"

  - title: "Book any required tours or tickets"
    estimatedMins: 20
    energyLevel: LOW
    contextName: "@Computer"

  - title: "Arrange travel insurance"
    estimatedMins: 15
    energyLevel: LOW
    contextName: "@Computer"

  - title: "Create packing list"
    estimatedMins: 15
    energyLevel: LOW
    contextName: "@Anywhere"

  - title: "Pack bags"
    estimatedMins: 60
    energyLevel: MEDIUM
    contextName: "@Home"

  - title: "Confirm all reservations 48 hours before departure"
    estimatedMins: 15
    energyLevel: LOW
    contextName: "@Computer"

  - title: "Download offline maps and boarding passes"
    estimatedMins: 10
    energyLevel: LOW
    contextName: "@Phone"
```

### 3.3 Example with Sub-Projects

```yaml
# docs/templates/launch-a-product.yaml
title: Launch a Product
description: >
  End-to-end product launch checklist covering marketing, engineering,
  and operations. Customize based on your team and product type.
type: PARALLEL
outcome: "{product_name} is live and announced"
icon: rocket
variables:
  - product_name
  - launch_date

subProjects:
  - title: "Engineering — {product_name}"
    type: SEQUENTIAL
    tasks:
      - title: "Feature freeze for {product_name}"
        estimatedMins: 15
        energyLevel: LOW
      - title: "Final QA pass"
        estimatedMins: 120
        energyLevel: HIGH
      - title: "Deploy to production"
        estimatedMins: 30
        energyLevel: HIGH
      - title: "Smoke test production"
        estimatedMins: 30
        energyLevel: MEDIUM

  - title: "Marketing — {product_name}"
    type: SEQUENTIAL
    tasks:
      - title: "Write launch announcement"
        estimatedMins: 60
        energyLevel: HIGH
        contextName: "@Computer"
      - title: "Prepare social media posts"
        estimatedMins: 30
        energyLevel: MEDIUM
        contextName: "@Computer"
      - title: "Send launch email"
        estimatedMins: 15
        energyLevel: LOW
        contextName: "@Computer"

tasks:
  - title: "Update website/landing page for {product_name}"
    estimatedMins: 60
    energyLevel: HIGH
    contextName: "@Computer"
  - title: "Monitor launch day metrics"
    estimatedMins: 30
    energyLevel: MEDIUM
    contextName: "@Computer"
```

### 3.4 Seed Mechanism

Follows the `HelpArticle` seed pattern:

```typescript
// prisma/seed-templates.ts
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { createHash } from "crypto";
import yaml from "js-yaml";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEMPLATES_DIR = join(process.cwd(), "docs/templates");

async function seedTemplates() {
  const files = await readdir(TEMPLATES_DIR);
  const yamlFiles = files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  let created = 0, updated = 0, unchanged = 0;

  for (const file of yamlFiles) {
    const filePath = join(TEMPLATES_DIR, file);
    const raw = await readFile(filePath, "utf-8");
    const sourceHash = createHash("sha256").update(raw).digest("hex");
    const data = yaml.load(raw) as TemplateYAML;

    const existing = await prisma.projectTemplate.findUnique({
      where: { sourceFile: file },
    });

    if (!existing) {
      await createTemplateFromYAML(data, file, sourceHash);
      created++;
    } else if (existing.sourceHash !== sourceHash) {
      // Delete existing task/sub templates and recreate
      await prisma.projectTaskTemplate.deleteMany({ where: { templateId: existing.id } });
      await prisma.projectSubTemplate.deleteMany({ where: { templateId: existing.id } });
      await updateTemplateFromYAML(existing.id, data, sourceHash);
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`Templates seeded: ${created} created, ${updated} updated, ${unchanged} unchanged`);
}
```

---

## 4. Template Instantiation

### 4.1 Instantiation Service

```typescript
// src/lib/services/template-service.ts
import { prisma } from "@/lib/prisma";
import { createProject } from "./project-service";
import { createTask } from "./task-service";
import type { ActorContext } from "./task-service";

interface InstantiateOptions {
  templateId: string;
  userId: string;
  variables: Record<string, string>;  // { destination: "Japan", travel_dates: "Mar 15-22" }
  projectTitle?: string;              // Override the template's title
  areaId?: string;
  goalId?: string;
  actor: ActorContext;
}

export async function instantiateTemplate(options: InstantiateOptions) {
  const { templateId, userId, variables, projectTitle, areaId, goalId, actor } = options;

  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: {
      taskTemplates: {
        where: { subProjectTemplateId: null },  // Top-level tasks only
        orderBy: { sortOrder: "asc" },
      },
      subProjectTemplates: {
        orderBy: { sortOrder: "asc" },
        include: {
          tasks: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!template) throw new Error("Template not found");

  // Resolve variable placeholders
  const resolve = (text: string): string => {
    let resolved = text;
    for (const [key, value] of Object.entries(variables)) {
      resolved = resolved.replaceAll(`{${key}}`, value);
    }
    return resolved;
  };

  // Resolve context names to IDs for this user
  const userContexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const contextMap = new Map(userContexts.map((c) => [c.name, c.id]));

  // 1. Create the project
  const project = await createProject(userId, {
    title: resolve(projectTitle || template.title),
    description: template.description || undefined,
    type: template.type,
    outcome: template.outcome ? resolve(template.outcome) : undefined,
    areaId,
    goalId,
  }, actor);

  // 2. Create sub-projects (if any)
  const subProjectMap = new Map<string, string>(); // template sub ID -> real project ID
  for (const subTemplate of template.subProjectTemplates) {
    const subProject = await createProject(userId, {
      title: resolve(subTemplate.title),
      type: subTemplate.type,
      outcome: subTemplate.outcome ? resolve(subTemplate.outcome) : undefined,
    }, actor);

    // Set as child of main project
    await prisma.project.update({
      where: { id: subProject.id },
      data: {
        parentProjectId: project.id,
        depth: 1,
        path: `${project.id}/`,
      },
    });

    subProjectMap.set(subTemplate.id, subProject.id);

    // Create tasks for this sub-project
    for (const taskTemplate of subTemplate.tasks) {
      await createTask(userId, {
        title: resolve(taskTemplate.title),
        notes: taskTemplate.notes ? resolve(taskTemplate.notes) : undefined,
        estimatedMins: taskTemplate.estimatedMins || undefined,
        energyLevel: taskTemplate.energyLevel || undefined,
        projectId: subProject.id,
        contextId: taskTemplate.contextName ? contextMap.get(taskTemplate.contextName) : undefined,
        sortOrder: taskTemplate.sortOrder,
      }, actor);
    }
  }

  // 3. Create top-level tasks
  for (const taskTemplate of template.taskTemplates) {
    await createTask(userId, {
      title: resolve(taskTemplate.title),
      notes: taskTemplate.notes ? resolve(taskTemplate.notes) : undefined,
      estimatedMins: taskTemplate.estimatedMins || undefined,
      energyLevel: taskTemplate.energyLevel || undefined,
      projectId: project.id,
      contextId: taskTemplate.contextName ? contextMap.get(taskTemplate.contextName) : undefined,
      sortOrder: taskTemplate.sortOrder,
    }, actor);
  }

  return project;
}
```

### 4.2 Context Name Resolution

Task templates store context names (`@Computer`, `@Home`) rather than context IDs because:
- System templates are shared across all users, each of whom has different context IDs
- User-created templates should be portable (if contexts are renamed, the name is still a better hint than a stale ID)
- On instantiation, the service looks up the user's contexts by name and maps them

If a context name doesn't match any of the user's contexts, the task is created without a context (graceful degradation).

---

## 5. Save as Template

### 5.1 Service Function

```typescript
// src/lib/services/template-service.ts (continued)

export async function saveProjectAsTemplate(
  projectId: string,
  userId: string,
  options: { title?: string; description?: string } = {}
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      tasks: {
        orderBy: { sortOrder: "asc" },
        include: {
          context: { select: { name: true } },
        },
      },
      childProjects: {
        orderBy: { sortOrder: "asc" },
        include: {
          tasks: {
            orderBy: { sortOrder: "asc" },
            include: {
              context: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!project) throw new Error("Project not found");

  // Detect potential variables from the project title
  // E.g., if project title is "Trip to Japan", suggest "Japan" as a variable
  // This is best done in the UI — the service just stores what the user provides.

  const template = await prisma.projectTemplate.create({
    data: {
      title: options.title || `${project.title} Template`,
      description: options.description || project.description,
      type: project.type,
      outcome: project.outcome,
      userId,
      isSystem: false,
      variables: [],
      taskTemplates: {
        create: project.tasks
          .filter((t) => t.status !== "DROPPED") // Skip dropped tasks
          .map((task, index) => ({
            title: task.title,
            notes: task.notes,
            estimatedMins: task.estimatedMins,
            energyLevel: task.energyLevel,
            contextName: task.context?.name || null,
            sortOrder: index,
          })),
      },
      subProjectTemplates: {
        create: project.childProjects.map((child, childIndex) => ({
          title: child.title,
          type: child.type,
          outcome: child.outcome,
          sortOrder: childIndex,
          tasks: {
            create: child.tasks
              .filter((t) => t.status !== "DROPPED")
              .map((task, taskIndex) => ({
                title: task.title,
                notes: task.notes,
                estimatedMins: task.estimatedMins,
                energyLevel: task.energyLevel,
                contextName: task.context?.name || null,
                sortOrder: taskIndex,
                templateId: undefined, // Will be set via nested create
              })),
          },
        })),
      },
    },
    include: {
      taskTemplates: true,
      subProjectTemplates: { include: { tasks: true } },
    },
  });

  return template;
}
```

Note: The nested create for `subProjectTemplates` with their `tasks` needs a two-step approach because `ProjectTaskTemplate` has both `templateId` and `subProjectTemplateId`. The tasks under sub-project templates should have `templateId` pointing to the root template. The actual implementation may need to create sub-project templates first, then create their tasks separately.

---

## 6. API Routes

### 6.1 Template CRUD

**`GET /api/project-templates`** -- list templates

```typescript
// Returns system templates + user's personal templates
const templates = await prisma.projectTemplate.findMany({
  where: {
    OR: [
      { isSystem: true },
      { userId },
    ],
  },
  include: {
    _count: { select: { taskTemplates: true, subProjectTemplates: true } },
  },
  orderBy: [{ isSystem: "desc" }, { title: "asc" }],
});
```

**`GET /api/project-templates/[id]`** -- get template with all tasks/sub-projects

**`POST /api/project-templates`** -- create user template (or via save-as-template)

**`POST /api/project-templates/[id]/instantiate`** -- create project from template

```typescript
const instantiateSchema = z.object({
  variables: z.record(z.string()).optional().default({}),
  projectTitle: z.string().max(200).optional(),
  areaId: z.string().optional(),
  goalId: z.string().optional(),
});
```

**`POST /api/projects/[id]/save-as-template`** -- save existing project as template

**`DELETE /api/project-templates/[id]`** -- delete user template (system templates cannot be deleted)

### 6.2 Validation Schemas

```typescript
// src/lib/validations/project-template.ts
import { z } from "zod";

export const createProjectTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]).default("SEQUENTIAL"),
  outcome: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  variables: z.array(z.string().max(50)).max(20).optional().default([]),
  taskTemplates: z.array(z.object({
    title: z.string().min(1).max(500),
    notes: z.string().max(5000).optional(),
    estimatedMins: z.number().int().positive().optional(),
    energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    contextName: z.string().max(50).optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
});

export const instantiateTemplateSchema = z.object({
  variables: z.record(z.string().max(200)).optional().default({}),
  projectTitle: z.string().min(1).max(200).optional(),
  areaId: z.string().optional(),
  goalId: z.string().optional(),
});

export const saveAsTemplateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});
```

---

## 7. UI

### 7.1 Template Library

Accessible from the "New Project" flow. When a user clicks "New Project", they see:

```
┌─────────────────────────────────────────────────────────┐
│  New Project                                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Start from Scratch]          [Browse Templates]        │
│                                                          │
│  ─── System Templates ──────────────────────────────    │
│                                                          │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │ ✈ Plan a Trip │ │ 👤 Hire       │ │ 🚀 Launch   │ │
│  │               │ │    Someone    │ │    a Product │ │
│  │ 10 tasks      │ │ 8 tasks       │ │ 3 sub-proj   │ │
│  │ Sequential    │ │ Sequential    │ │ Parallel     │ │
│  └────────────────┘ └────────────────┘ └──────────────┘ │
│                                                          │
│  ┌────────────────┐ ┌────────────────┐                  │
│  │ 📦 Move       │ │ 🛒 Weekly     │                  │
│  │ Apartments    │ │ Grocery Run   │                  │
│  │ 12 tasks      │ │ 6 tasks       │                  │
│  │ Sequential    │ │ Parallel      │                  │
│  └────────────────┘ └────────────────┘                  │
│                                                          │
│  ─── My Templates ──────────────────────────────────    │
│                                                          │
│  ┌────────────────┐                                     │
│  │ 📋 Sprint     │                                     │
│  │    Planning   │                                     │
│  │ 7 tasks       │                                     │
│  │ Sequential    │                                     │
│  └────────────────┘                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Clicking a template opens the instantiation dialog.

### 7.2 Instantiation Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Create from "Plan a Trip"                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Project Title:                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Trip to Japan                                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Fill in template variables:                             │
│                                                          │
│  destination:                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Japan                                            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  travel_dates:                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Mar 15-22                                        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Area: [None ▾]          Goal: [None ▾]                  │
│                                                          │
│  ─── Preview ────────────────────────────────────────   │
│  10 tasks will be created:                               │
│  1. Research Japan — flights, accommodation, activities  │
│  2. Book flights to Japan                                │
│  3. Book accommodation for Mar 15-22                     │
│  ...                                                     │
│                                                          │
│              [Cancel]  [Create Project]                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

The preview section shows task titles with variables resolved, giving the user confidence before committing.

### 7.3 Save as Template

A "Save as Template" option in the project's action menu (kebab menu or command palette):

```
┌───────────────────────────────────────┐
│  Save "Trip to Japan" as Template      │
├───────────────────────────────────────┤
│                                        │
│  Template Name:                        │
│  ┌────────────────────────────────┐   │
│  │ Plan a Trip                     │   │
│  └────────────────────────────────┘   │
│                                        │
│  Description (optional):               │
│  ┌────────────────────────────────┐   │
│  │ Trip planning checklist         │   │
│  └────────────────────────────────┘   │
│                                        │
│  Will capture:                         │
│  • 10 tasks (excluding dropped)        │
│  • Project type: Sequential            │
│  • Task titles, estimates, contexts    │
│                                        │
│         [Cancel]  [Save Template]      │
│                                        │
└───────────────────────────────────────┘
```

### 7.4 Component Files

```
src/components/projects/
  TemplateLibrary.tsx          -- Grid of template cards
  TemplateCard.tsx             -- Individual template card
  InstantiateTemplateDialog.tsx -- Variable input + preview + create
  SaveAsTemplateDialog.tsx     -- Save existing project as template
```

---

## 8. MCP Tool

### 8.1 Tool Definition

Add to `src/mcp/tools.ts`:

```typescript
{
  name: "tandem_project_create_from_template",
  description: "Create a project from a template. Lists available templates if no templateId given.",
  inputSchema: {
    type: "object",
    properties: {
      templateId: {
        type: "string",
        description: "ID of the template to instantiate. Omit to list available templates.",
      },
      variables: {
        type: "object",
        description: "Variable values to fill in template placeholders (e.g., {\"destination\": \"Japan\"})",
        additionalProperties: { type: "string" },
      },
      projectTitle: {
        type: "string",
        description: "Override the project title (optional)",
      },
      areaId: { type: "string", description: "Area to assign the project to" },
      goalId: { type: "string", description: "Goal to link the project to" },
    },
  },
}
```

### 8.2 Handler

```typescript
case "tandem_project_create_from_template": {
  const { templateId, variables, projectTitle, areaId, goalId } = args;

  // If no templateId, list available templates
  if (!templateId) {
    const templates = await prisma.projectTemplate.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        variables: true,
        isSystem: true,
        _count: { select: { taskTemplates: true } },
      },
      orderBy: [{ isSystem: "desc" }, { title: "asc" }],
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(templates, null, 2),
      }],
    };
  }

  const project = await instantiateTemplate({
    templateId,
    userId,
    variables: variables || {},
    projectTitle,
    areaId,
    goalId,
    actor: { actorType: "AI", actorId: userId, source: "MCP" },
  });

  return {
    content: [{
      type: "text",
      text: `Created project "${project.title}" (ID: ${project.id}) from template.`,
    }],
  };
}
```

---

## 9. Implementation Phases

### Phase 1: Data Model + System Templates + Seed

**Goal:** Template models exist, system templates are seeded from YAML files.

**Schema changes:**
- Add `ProjectTemplate`, `ProjectTaskTemplate`, `ProjectSubTemplate` models
- Add `projectTemplates` relation on `User`
- Migration: `npx prisma migrate dev --name add-project-templates`

**Dependencies:**
- `npm install js-yaml` + `@types/js-yaml`

**New files:**
- `prisma/seed-templates.ts` -- seed script
- `docs/templates/plan-a-trip.yaml`
- `docs/templates/hire-someone.yaml`
- `docs/templates/launch-a-product.yaml`
- `docs/templates/move-apartments.yaml`
- `docs/templates/weekly-grocery-run.yaml`
- `src/lib/validations/project-template.ts`

**Modified files:**
- `prisma/schema.prisma`
- `package.json` -- add seed script, js-yaml dependency

**Files touched:** ~10

### Phase 2: Instantiation Service + API + UI

**Goal:** Users can create projects from templates.

**New files:**
- `src/lib/services/template-service.ts` -- `instantiateTemplate()`
- `src/app/api/project-templates/route.ts` -- GET (list), POST (create)
- `src/app/api/project-templates/[id]/route.ts` -- GET, DELETE
- `src/app/api/project-templates/[id]/instantiate/route.ts` -- POST
- `src/components/projects/TemplateLibrary.tsx`
- `src/components/projects/TemplateCard.tsx`
- `src/components/projects/InstantiateTemplateDialog.tsx`

**Modified files:**
- `src/components/projects/` -- integrate template library into New Project flow

**Files touched:** ~8

### Phase 3: Save as Template

**Goal:** Users can save existing projects as reusable templates.

**New files:**
- `src/app/api/projects/[id]/save-as-template/route.ts`
- `src/components/projects/SaveAsTemplateDialog.tsx`

**Modified files:**
- `src/lib/services/template-service.ts` -- add `saveProjectAsTemplate()`
- Project detail page or menu -- add "Save as Template" action

**Files touched:** ~4

### Phase 4: MCP Tool + Variable Enhancement

**Goal:** AI assistants can instantiate templates. Variable UX improvements.

**Modified files:**
- `src/mcp/tools.ts` -- add `tandem_project_create_from_template` tool definition + handler

**Enhancements:**
- Auto-detect variables from task titles when saving as template (regex for `{word}` patterns)
- Variable description/label support in YAML for better prompts
- Template editing UI (edit task list, reorder, add/remove)

**Files touched:** ~3

---

## 10. Edge Cases

- **Missing variables:** If a template has variables but the user does not provide all values, unresolved `{variable}` placeholders remain in task titles as literal text. The instantiation dialog should validate that all declared variables have values before allowing creation.
- **Context name mismatch:** If a template references `@Computer` but the user's contexts use `@Laptop`, the task is created without a context. The UI could show a mapping step if mismatches are detected.
- **Deep nesting:** Sub-project templates are limited to one level (matching the existing max depth of 3 for projects -- the root project is depth 0, sub-project is depth 1). The YAML format does not support nested sub-projects.
- **Large templates:** A template with 50+ tasks is valid but instantiation may be slow because each task goes through `createTask()` with full history event recording. For very large templates, a bulk creation path (bypassing per-task events) could be added later.
- **System template deletion:** System templates (`isSystem: true`) cannot be deleted by users. The API rejects delete requests for system templates with a 403.
- **Template versioning:** System templates update via the seed hash mechanism. User templates do not version -- editing a template overwrites it. Version history could be added later if needed.

---

## 11. What This Spec Does Not Cover

- **Template marketplace** -- sharing templates between users or publishing them. Templates are personal or system-provided.
- **Template import/export** -- YAML import for user templates could be useful but is not in scope. Users create templates via "Save as Template" or manual creation.
- **Recurring project templates** -- combining project templates with recurring schedules (e.g., "every quarter, instantiate the Quarterly Planning template"). This is a natural extension but adds complexity.
- **Template editing UI** -- Phase 1-3 cover creation and instantiation. A full template editor (drag-drop task reordering, inline editing) can be built later.
- **Conditional tasks** -- tasks that only appear based on variable values (e.g., "if international trip, include visa task"). Keeping templates simple for now.
```

---
