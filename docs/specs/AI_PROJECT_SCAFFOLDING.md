# AI Project Scaffolding — Smart Task Sequencing for New Projects

> **Status:** Draft
> **Last updated:** 2026-02-24

---

## 1. Problem Statement

### What Exists

Tandem has a robust task dependency and sequencing system:

- **Project types** — SEQUENTIAL, PARALLEL, SINGLE_ACTIONS — control how the cascade engine promotes next actions (`src/lib/cascade.ts`)
- **Task dependencies** — 4 types (finish-to-start, start-to-start, finish-to-finish, start-to-finish) with lag time (`TaskDependency` model)
- **Critical path analysis** — CPM engine computes bottleneck tasks and project duration (`src/lib/gantt/critical-path.ts`)
- **Auto-schedule** — assigns dates to tasks based on dependency chains (`POST /api/projects/[id]/auto-schedule`)
- **Cascade engine** — automatically promotes the next task when one completes, rolls up project/goal progress

All of this machinery works well once dependencies are wired up. The problem is the wiring.

### The Gap

When a user creates a new project and adds tasks, they must:

1. **Choose the project type** (sequential vs. parallel) — no guidance on which fits their tasks
2. **Manually set task order** — drag tasks into the right sequence
3. **Manually add dependencies** — click through the dependency UI for each relationship

For a 5-task project, this is manageable. For a 10-task project, it's tedious. And for a user describing a project to an AI assistant via MCP ("create a project for renovating the bathroom"), the AI has no way to reason about which tasks should come first.

The infrastructure is all there — dependencies, CPM, auto-schedule, cascade. What's missing is an AI layer that looks at a set of tasks and says "these should be sequential, task 3 blocks task 5, and here's a reasonable order."

### What Done Looks Like

When a user creates a project with multiple tasks (in the UI or via MCP), AI analyzes the task titles and:

1. **Recommends a project type** — sequential, parallel, or a mix
2. **Proposes a task ordering** with finish-to-start dependency chains where appropriate
3. **Shows the suggestion as a preview** the user can accept, edit, or dismiss

The user always has the final say — they can switch the project type, reorder tasks, and remove any AI-suggested dependencies after creation.

---

## 2. Data Model Changes

No new models. The AI scaffolding produces output that maps directly to existing structures:

- `Project.type` — SEQUENTIAL / PARALLEL / SINGLE_ACTIONS
- `Task.sortOrder` — integer ordering within a project
- `TaskDependency` — predecessor/successor with `DependencyType`

The AI endpoint returns a suggestion payload; the client or MCP handler creates real records using the existing `createTask()` and dependency APIs.

### Suggestion Payload Shape

```typescript
interface ProjectScaffoldSuggestion {
  projectType: "SEQUENTIAL" | "PARALLEL" | "SINGLE_ACTIONS";
  projectTypeReason: string;                    // Short explanation for the user
  tasks: Array<{
    title: string;                              // Original or cleaned title
    sortOrder: number;                          // Suggested position (0-based)
    estimatedMins?: number;                     // AI-inferred estimate
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";   // AI-inferred energy
    contextName?: string;                       // AI-inferred context
    dependsOn?: number[];                       // sortOrder indices this task depends on (finish-to-start)
  }>;
  phases?: Array<{                              // Optional grouping for complex projects
    label: string;                              // "Preparation", "Execution", "Cleanup"
    taskIndices: number[];                      // Which tasks belong to this phase
  }>;
}
```

---

## 3. AI Scaffolding Endpoint

### 3.1 Endpoint

`POST /api/ai/scaffold-project`

Takes a list of task titles (and optionally a project description) and returns a `ProjectScaffoldSuggestion`.

### 3.2 Input Schema

```typescript
const scaffoldProjectSchema = z.object({
  projectTitle: z.string().min(1).max(200),
  projectDescription: z.string().max(2000).optional(),
  tasks: z.array(z.object({
    title: z.string().min(1).max(500),
  })).min(2).max(50),
});
```

### 3.3 System Prompt

```typescript
// src/lib/ai/scaffold-prompts.ts

export function buildScaffoldSystemPrompt(
  contexts: Array<{ name: string }>
): string {
  return `You are a project planning assistant. Given a project title and a list of tasks, \
analyze the tasks and suggest the best ordering and dependency structure.

Your job:
1. Determine if the project should be SEQUENTIAL (tasks have a natural order — one must finish \
before the next can start), PARALLEL (tasks can all happen independently), or a MIX \
(some sequential chains within an otherwise parallel project).
   - If MIX, use SEQUENTIAL as the project type and express parallelism through dependencies \
(tasks with no dependency on each other can run in parallel even in a sequential project).

2. Order the tasks logically. Consider:
   - Physical dependencies (can't paint walls before drywall is up)
   - Information dependencies (can't send invitations before setting a date)
   - Resource dependencies (can't do two things at once if they require the same person)
   - Natural workflow (research before decisions, decisions before action, action before review)

3. For each task, suggest which tasks it depends on (finish-to-start). Only add dependencies \
where there is a real blocking relationship — not just "this is a nice order." If tasks can \
genuinely run in parallel, leave them without dependencies on each other.

4. Optionally infer:
   - estimatedMins: rough time estimate (5-480 range)
   - energyLevel: HIGH (creative/complex), MEDIUM (focused routine), LOW (simple/mechanical)
   - contextName: must be one of the available contexts listed below, or null

Available contexts: ${contexts.map((c) => c.name).join(", ")}

Respond with ONLY a JSON object matching this structure (no markdown, no explanation):
{
  "projectType": "SEQUENTIAL" | "PARALLEL",
  "projectTypeReason": "one sentence explaining why",
  "tasks": [
    {
      "title": "original or lightly cleaned title",
      "sortOrder": 0,
      "estimatedMins": number | null,
      "energyLevel": "LOW" | "MEDIUM" | "HIGH" | null,
      "contextName": "@ContextName" | null,
      "dependsOn": []
    }
  ],
  "phases": [
    { "label": "Phase name", "taskIndices": [0, 1, 2] }
  ]
}

Rules:
- dependsOn values are sortOrder indices (0-based), not task titles
- Do not invent new tasks — only reorder and annotate the provided tasks
- Keep all original tasks — do not drop any
- phases is optional — only include if the project naturally breaks into 3+ distinct stages
- If the tasks are clearly unrelated (a grab-bag), use SINGLE_ACTIONS as projectType`;
}
```

### 3.4 Route Implementation

```typescript
// src/app/api/ai/scaffold-project/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { resolveAIConfig, checkAILimit } from "@/lib/ai/resolve-key";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { buildScaffoldSystemPrompt } from "@/lib/ai/scaffold-prompts";
import { z } from "zod";

const scaffoldProjectSchema = z.object({
  projectTitle: z.string().min(1).max(200),
  projectDescription: z.string().max(2000).optional(),
  tasks: z.array(z.object({
    title: z.string().min(1).max(500),
  })).min(2).max(50),
});

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  // Rate limit: 5 scaffold requests per minute
  const rateLimited = checkRateLimit(`ai-scaffold:${userId}`, 5, 60_000);
  if (rateLimited) return rateLimited;

  const withinLimit = await checkAILimit(userId);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Daily AI limit reached" },
      { status: 429 }
    );
  }

  const config = await resolveAIConfig(userId);
  if (!config) {
    return NextResponse.json(
      { error: "AI not available" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = scaffoldProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { projectTitle, projectDescription, tasks } = parsed.data;

  // Get user's contexts for matching
  const contexts = await prisma.context.findMany({
    where: { userId },
    select: { name: true },
  });

  const systemPrompt = buildScaffoldSystemPrompt(contexts);

  const userMessage = `Project: "${projectTitle}"${
    projectDescription ? `\nDescription: ${projectDescription}` : ""
  }\n\nTasks:\n${tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n")}`;

  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model || "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      return NextResponse.json(
        { error: "AI scaffold failed" },
        { status: 502 }
      );
    }

    const result = await anthropicResponse.json();
    const content = result.content?.[0]?.text || "{}";

    // Parse and validate the AI response
    const suggestion = JSON.parse(content);

    // Validate that all original tasks are present
    if (!suggestion.tasks || suggestion.tasks.length !== tasks.length) {
      return NextResponse.json(
        { error: "AI returned wrong number of tasks" },
        { status: 502 }
      );
    }

    // Validate dependsOn indices are in range
    for (const task of suggestion.tasks) {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          if (dep < 0 || dep >= suggestion.tasks.length || dep === task.sortOrder) {
            task.dependsOn = task.dependsOn.filter(
              (d: number) => d >= 0 && d < suggestion.tasks.length && d !== task.sortOrder
            );
          }
        }
      }
    }

    return NextResponse.json(suggestion);
  } catch {
    return NextResponse.json(
      { error: "AI scaffold failed" },
      { status: 502 }
    );
  }
}
```

---

## 4. Applying the Scaffold

### 4.1 Apply Service Function

A helper that takes a `ProjectScaffoldSuggestion` and creates the project with tasks and dependencies wired up.

```typescript
// src/lib/services/scaffold-service.ts

import { prisma } from "@/lib/prisma";
import { createProject } from "./project-service";
import { createTask } from "./task-service";
import type { ActorContext } from "./task-service";

interface ApplyScaffoldOptions {
  userId: string;
  projectTitle: string;
  projectDescription?: string;
  suggestion: ProjectScaffoldSuggestion;
  areaId?: string;
  goalId?: string;
  actor: ActorContext;
}

export async function applyProjectScaffold(options: ApplyScaffoldOptions) {
  const { userId, projectTitle, projectDescription, suggestion, areaId, goalId, actor } = options;

  // Resolve context names to IDs
  const userContexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const contextMap = new Map(userContexts.map((c) => [c.name, c.id]));

  // 1. Create the project
  const project = await createProject(userId, {
    title: projectTitle,
    description: projectDescription,
    type: suggestion.projectType === "SINGLE_ACTIONS" ? "SINGLE_ACTIONS" : suggestion.projectType,
    areaId,
    goalId,
  }, actor);

  // 2. Create tasks in sort order
  const taskIdBySortOrder = new Map<number, string>();

  for (const taskSuggestion of suggestion.tasks.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const task = await createTask(userId, {
      title: taskSuggestion.title,
      projectId: project.id,
      estimatedMins: taskSuggestion.estimatedMins || undefined,
      energyLevel: taskSuggestion.energyLevel || undefined,
      contextId: taskSuggestion.contextName
        ? contextMap.get(taskSuggestion.contextName)
        : undefined,
      sortOrder: taskSuggestion.sortOrder,
    }, actor);

    taskIdBySortOrder.set(taskSuggestion.sortOrder, task.id);
  }

  // 3. Create dependencies
  for (const taskSuggestion of suggestion.tasks) {
    if (!taskSuggestion.dependsOn?.length) continue;

    const successorId = taskIdBySortOrder.get(taskSuggestion.sortOrder);
    if (!successorId) continue;

    for (const predIndex of taskSuggestion.dependsOn) {
      const predecessorId = taskIdBySortOrder.get(predIndex);
      if (!predecessorId) continue;

      await prisma.taskDependency.create({
        data: {
          predecessorId,
          successorId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
        },
      });
    }
  }

  return project;
}
```

---

## 5. UI Integration

### 5.1 Entry Point: New Project with Tasks

When a user creates a new project and adds 2+ tasks, an "AI Suggest Order" button appears. This is not automatic — the user opts in by clicking the button.

```
+--------------------------------------------------------------+
|  New Project                                                  |
+--------------------------------------------------------------+
|                                                               |
|  Title: Renovate Bathroom                                     |
|  Type:  [Sequential v]       Area: [Home v]                   |
|                                                               |
|  Tasks:                                                       |
|  1. [ ] Demo existing tile                                    |
|  2. [ ] Pick new fixtures                                     |
|  3. [ ] Rough plumbing                                        |
|  4. [ ] Install new tile                                      |
|  5. [ ] Install fixtures                                      |
|  6. [ ] Final inspection                                      |
|  7. [ ] Order materials                                       |
|                                                               |
|  [+ Add Task]                                                 |
|                                                               |
|          [AI Suggest Order]     [Create Project]              |
|                                                               |
+--------------------------------------------------------------+
```

### 5.2 AI Suggestion Preview

After clicking "AI Suggest Order", the tasks rearrange into the AI's suggested order with dependency arrows shown. The project type selector updates to match the AI's recommendation. A banner explains the reasoning.

```
+--------------------------------------------------------------+
|  New Project                                     [AI Applied] |
+--------------------------------------------------------------+
|                                                               |
|  Title: Renovate Bathroom                                     |
|  Type:  [Sequential v]       Area: [Home v]                   |
|                                                               |
|  AI says: "These tasks have a natural physical dependency     |
|  chain — each step requires the previous one to be done."     |
|                                                               |
|  Tasks (reordered):                                           |
|  1. [ ] Pick new fixtures                                     |
|  2. [ ] Order materials               depends on: 1           |
|  3. [ ] Demo existing tile             depends on: 2           |
|  4. [ ] Rough plumbing                 depends on: 3           |
|  5. [ ] Install new tile               depends on: 4           |
|  6. [ ] Install fixtures               depends on: 5           |
|  7. [ ] Final inspection               depends on: 6           |
|                                                               |
|  [Undo AI Changes]   [Edit Dependencies]   [Create Project]  |
|                                                               |
+--------------------------------------------------------------+
```

The user can:
- **Accept** and create the project as suggested
- **Undo AI Changes** to return to their original order
- **Edit** any individual task's position or dependencies before creating
- **Change the project type** — the selector is still editable after AI suggestion

### 5.3 Component Structure

```
src/components/projects/
  ProjectCreateDialog.tsx          -- Existing. Add AI scaffold button.
  ProjectScaffoldPreview.tsx       -- NEW. Shows AI-suggested order with dependency indicators.
  ProjectScaffoldBanner.tsx        -- NEW. Displays AI reasoning and undo option.
```

### 5.4 ProjectScaffoldPreview Component

```typescript
// src/components/projects/ProjectScaffoldPreview.tsx

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, Sparkles, Undo2, GripVertical } from "lucide-react";
import type { ProjectScaffoldSuggestion } from "@/lib/ai/scaffold-types";

interface ProjectScaffoldPreviewProps {
  suggestion: ProjectScaffoldSuggestion;
  onAccept: (suggestion: ProjectScaffoldSuggestion) => void;
  onUndo: () => void;
}

export function ProjectScaffoldPreview({
  suggestion,
  onAccept,
  onUndo,
}: ProjectScaffoldPreviewProps) {
  const projectTypeLabels = {
    SEQUENTIAL: "Sequential",
    PARALLEL: "Parallel",
    SINGLE_ACTIONS: "Single Actions",
  };

  return (
    <div className="space-y-3">
      {/* AI reasoning banner */}
      <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium">
            Suggested: {projectTypeLabels[suggestion.projectType]}
          </span>
          <p className="text-muted-foreground mt-0.5">
            {suggestion.projectTypeReason}
          </p>
        </div>
      </div>

      {/* Task list with dependency indicators */}
      <div className="space-y-1">
        {suggestion.tasks
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((task) => (
            <div
              key={task.sortOrder}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">{task.title}</span>

              {task.dependsOn && task.dependsOn.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  after {task.dependsOn.map((d) => `#${d + 1}`).join(", ")}
                </Badge>
              )}

              {task.estimatedMins && (
                <span className="text-xs text-muted-foreground">
                  ~{task.estimatedMins}m
                </span>
              )}

              {task.energyLevel && (
                <Badge variant="secondary" className="text-xs">
                  {task.energyLevel.toLowerCase()}
                </Badge>
              )}
            </div>
          ))}
      </div>

      {/* Phases (if present) */}
      {suggestion.phases && suggestion.phases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestion.phases.map((phase) => (
            <Badge key={phase.label} variant="outline">
              {phase.label}: tasks{" "}
              {phase.taskIndices.map((i) => `#${i + 1}`).join(", ")}
            </Badge>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onUndo}>
          <Undo2 className="h-3.5 w-3.5 mr-1" />
          Undo AI Changes
        </Button>
      </div>
    </div>
  );
}
```

---

## 6. MCP Integration

### 6.1 Enhanced Project Creation Tool

The existing `tandem_project_create` MCP tool gets a new optional parameter `aiSequence` that triggers scaffolding when tasks are included.

```typescript
// Addition to tandem_project_create in src/mcp/tools.ts

// New property in inputSchema:
aiSequence: {
  type: "boolean",
  description:
    "If true and tasks are provided, use AI to suggest the optimal task order, " +
    "project type, and dependencies. The AI analyzes task titles to determine " +
    "which tasks should come first and which block others. " +
    "Default: false.",
},
tasks: {
  type: "array",
  description: "Tasks to create in the project. When aiSequence is true, " +
    "the AI will reorder these and add dependencies.",
  items: {
    type: "object",
    properties: {
      title: { type: "string", description: "Task title" },
    },
    required: ["title"],
  },
},
```

### 6.2 MCP Handler Update

```typescript
case "tandem_project_create": {
  const { title, description, type, outcome, areaId, goalId, tasks, aiSequence } = args;

  // If AI sequencing requested and tasks provided
  if (aiSequence && tasks?.length >= 2) {
    const config = await resolveAIConfig(userId);
    if (!config) {
      return {
        content: [{
          type: "text",
          text: "AI sequencing requested but AI is not available for this user.",
        }],
        isError: true,
      };
    }

    // Get user contexts
    const contexts = await prisma.context.findMany({
      where: { userId },
      select: { name: true },
    });

    // Call the scaffold AI
    const suggestion = await getScaffoldSuggestion(config, {
      projectTitle: title,
      projectDescription: description,
      tasks: tasks.map((t: { title: string }) => ({ title: t.title })),
      contexts,
    });

    // Apply the scaffold
    const project = await applyProjectScaffold({
      userId,
      projectTitle: title,
      projectDescription: description,
      suggestion,
      areaId,
      goalId,
      actor: { actorType: "AI", actorId: userId, source: "MCP" },
    });

    const taskList = suggestion.tasks
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t, i) => {
        const deps = t.dependsOn?.length
          ? ` (after: ${t.dependsOn.map((d) => suggestion.tasks[d].title).join(", ")})`
          : "";
        return `${i + 1}. ${t.title}${deps}`;
      })
      .join("\n");

    return {
      content: [{
        type: "text",
        text: `Created project "${project.title}" (${project.id})\n` +
          `Type: ${suggestion.projectType} — ${suggestion.projectTypeReason}\n\n` +
          `Tasks (AI-ordered):\n${taskList}`,
      }],
    };
  }

  // ... existing non-AI project creation logic
}
```

### 6.3 Shared AI Call Function

```typescript
// src/lib/ai/scaffold-ai.ts

import { buildScaffoldSystemPrompt } from "./scaffold-prompts";
import type { ProjectScaffoldSuggestion } from "./scaffold-types";

interface ScaffoldInput {
  projectTitle: string;
  projectDescription?: string;
  tasks: Array<{ title: string }>;
  contexts: Array<{ name: string }>;
}

export async function getScaffoldSuggestion(
  config: { apiKey: string; model?: string },
  input: ScaffoldInput
): Promise<ProjectScaffoldSuggestion> {
  const systemPrompt = buildScaffoldSystemPrompt(input.contexts);

  const userMessage = `Project: "${input.projectTitle}"${
    input.projectDescription ? `\nDescription: ${input.projectDescription}` : ""
  }\n\nTasks:\n${input.tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n")}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model || "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI scaffold request failed: ${response.status}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text || "{}";
  const suggestion: ProjectScaffoldSuggestion = JSON.parse(content);

  // Validate task count matches
  if (suggestion.tasks.length !== input.tasks.length) {
    throw new Error("AI returned wrong number of tasks");
  }

  // Sanitize dependsOn indices
  for (const task of suggestion.tasks) {
    if (task.dependsOn) {
      task.dependsOn = task.dependsOn.filter(
        (d) => d >= 0 && d < suggestion.tasks.length && d !== task.sortOrder
      );
    }
  }

  return suggestion;
}
```

---

## 7. MCP Example Interactions

### 7.1 AI Assistant Creates a Sequenced Project

```
User: "Create a project for renovating my bathroom. Tasks: demo tile,
       pick fixtures, rough plumbing, install tile, install fixtures,
       order materials, final inspection"

AI calls tandem_project_create with:
{
  "title": "Renovate Bathroom",
  "tasks": [
    { "title": "Demo existing tile" },
    { "title": "Pick new fixtures" },
    { "title": "Rough plumbing" },
    { "title": "Install new tile" },
    { "title": "Install fixtures" },
    { "title": "Order materials" },
    { "title": "Final inspection" }
  ],
  "aiSequence": true
}

Response:
Created project "Renovate Bathroom" (clxyz123)
Type: SEQUENTIAL — Tasks have physical dependencies; each step requires
the previous work to be complete.

Tasks (AI-ordered):
1. Pick new fixtures
2. Order materials (after: Pick new fixtures)
3. Demo existing tile (after: Order materials)
4. Rough plumbing (after: Demo existing tile)
5. Install new tile (after: Rough plumbing)
6. Install fixtures (after: Install new tile)
7. Final inspection (after: Install fixtures)
```

### 7.2 AI Detects a Parallel Project

```
User: "Create a project for spring cleaning. Tasks: clean kitchen,
       clean bathrooms, organize garage, wash windows, deep clean carpets"

Response:
Created project "Spring Cleaning" (clxyz456)
Type: PARALLEL — These tasks are independent of each other and can be
done in any order.

Tasks (AI-ordered):
1. Clean kitchen
2. Clean bathrooms
3. Wash windows
4. Deep clean carpets
5. Organize garage

(No dependencies — all tasks are independent next actions)
```

---

## 8. Privacy & Security

- **Same guardrails as existing AI features:** server-level toggle, user-level toggle, daily limits, rate limiting (5 scaffold requests/minute)
- **Task titles only:** the AI sees task titles and the project title/description. It does not see task notes, other projects, or any other user data.
- **AI visibility controls apply:** if `aiCanReadTasks` is false, the scaffold endpoint returns 403. Though in practice, the user is explicitly submitting task titles for analysis — this is not ambient reading.
- **No data persistence:** the AI suggestion is ephemeral. It's returned to the client, which applies it via normal `createTask()` / dependency APIs. No scaffold suggestions are stored.

---

## 9. Implementation Phases

### Phase 1: AI Scaffolding Endpoint + Shared Logic

**Goal:** The AI can analyze a set of tasks and suggest ordering.

**New files:**
- `src/lib/ai/scaffold-prompts.ts` — System prompt for scaffolding
- `src/lib/ai/scaffold-types.ts` — TypeScript types for suggestion payload
- `src/lib/ai/scaffold-ai.ts` — Shared AI call function (used by API route and MCP)
- `src/app/api/ai/scaffold-project/route.ts` — API endpoint
- `src/lib/services/scaffold-service.ts` — `applyProjectScaffold()` function

**Files touched:** 5

### Phase 2: MCP Integration

**Goal:** AI assistants can create sequenced projects via MCP.

**Modified files:**
- `src/mcp/tools.ts` — Add `aiSequence` and `tasks` params to `tandem_project_create`, update handler

**Files touched:** 1

### Phase 3: UI Integration

**Goal:** "AI Suggest Order" button in the project creation flow.

**New files:**
- `src/components/projects/ProjectScaffoldPreview.tsx` — Suggestion preview with dependency indicators
- `src/components/projects/ProjectScaffoldBanner.tsx` — AI reasoning banner

**Modified files:**
- `src/components/projects/ProjectCreateDialog.tsx` (or equivalent) — Add scaffold button, loading state, preview toggle

**Files touched:** 3

---

## 10. Edge Cases

- **2 tasks:** AI still runs but the value is low. The UI should only show the "AI Suggest Order" button for 3+ tasks. The API accepts 2+ for MCP flexibility.
- **Unrelated tasks:** "buy milk, write novel, fix car" — AI should return SINGLE_ACTIONS with no dependencies. The prompt instructs this.
- **Circular dependencies:** The AI could theoretically suggest A depends on B depends on A. The sanitization step in the handler strips self-references, and the existing `POST /api/tasks/[id]/dependencies` endpoint already prevents cycles.
- **AI returns wrong task count:** If the AI drops or adds tasks, the endpoint returns a 502. The client falls back to no suggestion.
- **AI returns invalid JSON:** Caught by `JSON.parse()` try/catch, returns 502.
- **Large projects (20+ tasks):** The prompt works but quality may degrade. The max is 50 tasks to keep the AI call reasonable. For very large projects, consider chunking by phase in a future iteration.
- **User overrides after creation:** The user can always change the project type (SEQUENTIAL to PARALLEL) and delete/add dependencies after the project is created. The AI suggestion is a starting point, not a constraint.

---

## 11. Future Enhancements (Not in Scope)

- **AI task breakdown:** Given a project title and description but no tasks, AI generates the task list. This is a superset of scaffolding — it creates tasks, not just orders them.
- **AI dependency type selection:** Currently all AI-suggested dependencies are finish-to-start. A future version could suggest start-to-start or finish-to-finish where appropriate.
- **Learning from user edits:** If users consistently override the AI's suggestions (e.g., always switching from SEQUENTIAL to PARALLEL), the AI could adapt. Requires tracking suggestion acceptance rates.
- **Auto-schedule after scaffold:** Automatically run the CPM auto-scheduler after scaffolding to assign dates. Currently the user would do this as a separate step.
- **Integration with Project Templates:** When instantiating a template, AI could adjust the template's task order based on the user's specific variable values (e.g., a trip to Japan vs. a trip to the next town might have different sequencing needs).

---

## 12. Key Files Reference

| File | What's There | What Changes |
|---|---|---|
| `src/lib/cascade.ts` | GTD dependency promotion logic | No changes — scaffolding feeds into existing cascade |
| `src/lib/services/task-service.ts` | `createTask()` with history events | No changes — called by scaffold service |
| `src/lib/services/project-service.ts` | `createProject()` with history events | No changes — called by scaffold service |
| `src/app/api/tasks/[id]/dependencies/route.ts` | Dependency CRUD with cycle prevention | No changes — scaffold creates deps directly via Prisma |
| `src/lib/gantt/critical-path.ts` | CPM engine | No changes — works on scaffolded dependencies automatically |
| `src/app/api/projects/[id]/auto-schedule/route.ts` | Auto-schedule from CPM | No changes — user can run after scaffolding |
| `src/mcp/tools.ts` | MCP tool definitions + handlers | Phase 2: add `aiSequence` + `tasks` to project create |
| `src/lib/ai/resolve-key.ts` | AI config resolution | No changes — reused by scaffold endpoint |
