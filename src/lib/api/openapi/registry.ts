/**
 * OpenAPI route registry — declares every public API route with method, path,
 * tags, auth requirement, and Zod schema references for request/response.
 *
 * The generator reads this to produce public/openapi.json.
 */
import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with .openapi() method
extendZodWithOpenApi(z);

// Input schemas
import { createTaskSchema, updateTaskSchema, addDependencySchema } from "@/lib/validations/task";
import { createProjectSchema, updateProjectSchema, createSubProjectSchema, moveProjectSchema, captureBaselineSchema, reorderChildrenSchema } from "@/lib/validations/project";
import { createProjectTemplateSchema, instantiateTemplateSchema, saveAsTemplateSchema } from "@/lib/validations/project-template";
import { createGoalSchema, updateGoalSchema } from "@/lib/validations/goal";
import { createAreaSchema, updateAreaSchema } from "@/lib/validations/area";
import { createContextSchema, updateContextSchema } from "@/lib/validations/context";
import { createInboxItemSchema, updateInboxItemSchema } from "@/lib/validations/inbox";
import { createWaitingForSchema, updateWaitingForSchema } from "@/lib/validations/waiting-for";
import { createReviewSchema, updateReviewSchema } from "@/lib/validations/review";
import { createTeamSchema, updateTeamSchema, addTeamMemberSchema, updateTeamMemberSchema } from "@/lib/validations/team";
import { createThreadSchema, addMessageSchema, updateMessageSchema } from "@/lib/validations/thread";
import { createDecisionSchema, respondDecisionSchema, resolveDecisionSchema, voteOptionSchema } from "@/lib/validations/decision";

// Response schemas
import {
  TaskResponse,
  ProjectResponse,
  InboxItemResponse,
  ContextResponse,
  AreaResponse,
  GoalResponse,
  WikiArticleListResponse,
  WikiArticleResponse,
  WaitingForResponse,
  WeeklyReviewResponse,
  ReviewListResponse,
  TeamResponse,
  TeamListResponse,
  NotificationResponse,
  HorizonNoteResponse,
  ActivityFeedEvent,
  SearchResultsResponse,
  ErrorResponse,
  SuccessResponse,
  ConflictResponse,
  FeatureFlagsResponse,
  ApiTokenResponse,
  ApiTokenCreatedResponse,
  ProjectTemplateResponse,
  ThreadResponse,
  ThreadListResponse,
  ThreadMessageResponse,
  DecisionResponse,
  DecisionListResponse,
} from "./response-schemas";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const registry = new OpenAPIRegistry();

// Register Bearer security scheme
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Personal API token (tnm_...). Create one in Settings → API Tokens.",
});

// Common security requirement
const bearerSecurity = [{ BearerAuth: [] }];

// Helpers
const jsonContent = (schema: z.ZodType) => ({
  content: { "application/json": { schema } },
});

const jsonResponse = (description: string, schema: z.ZodType) => ({
  description,
  ...jsonContent(schema),
});

const errorResponses = {
  "400": jsonResponse("Bad request", ErrorResponse),
  "401": jsonResponse("Unauthorized", ErrorResponse),
  "403": jsonResponse("Forbidden", ErrorResponse),
  "404": jsonResponse("Not found", ErrorResponse),
  "429": jsonResponse("Rate limited", ErrorResponse),
};

const idParam = z.object({ id: z.string().openapi({ description: "Resource ID" }) });
const slugParam = z.object({ slug: z.string().openapi({ description: "Article slug" }) });

// ═══════════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/tasks",
  summary: "List tasks",
  description: "Returns all tasks for the authenticated user, with optional filters.",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: {
    query: z.object({
      projectId: z.string().optional(),
      contextId: z.string().optional(),
      status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DROPPED"]).optional(),
      isNextAction: z.enum(["true"]).optional(),
      due: z.string().optional().openapi({ description: "Filter by due date: today, tomorrow, overdue, or YYYY-MM-DD" }),
      dueBefore: z.string().optional().openapi({ description: "Tasks due before this date (YYYY-MM-DD), exclusive" }),
      dueAfter: z.string().optional().openapi({ description: "Tasks due on or after this date (YYYY-MM-DD), inclusive" }),
      scheduled: z.string().optional().openapi({ description: "Filter by scheduled date: today, tomorrow, overdue, or YYYY-MM-DD" }),
      scheduledBefore: z.string().optional().openapi({ description: "Tasks scheduled before this date (YYYY-MM-DD), exclusive" }),
      scheduledAfter: z.string().optional().openapi({ description: "Tasks scheduled on or after this date (YYYY-MM-DD), inclusive" }),
    }),
  },
  responses: {
    "200": jsonResponse("Task list", z.array(TaskResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks",
  summary: "Create a task",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createTaskSchema) } },
  responses: {
    "201": jsonResponse("Created task", TaskResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/tasks",
  summary: "Update a task",
  description: "Pass `id` and optional `version` in the body for optimistic concurrency.",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(updateTaskSchema.extend({ id: z.string(), version: z.number().optional() })),
    },
  },
  responses: {
    "200": jsonResponse("Updated task", TaskResponse),
    "409": jsonResponse("Version conflict", ConflictResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/tasks",
  summary: "Delete a task",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: {
    query: z.object({ id: z.string().openapi({ description: "Task ID to delete" }) }),
  },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/parse",
  summary: "Parse natural language into task fields",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(z.object({ text: z.string() })) } },
  responses: {
    "200": jsonResponse("Parsed task", z.object({
      title: z.string(),
      dueDate: z.string().nullable(),
      contextName: z.string().nullable(),
      energyLevel: z.string().nullable(),
      estimatedMins: z.number().nullable(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/available",
  summary: "List available tasks (not deferred, not blocked)",
  tags: ["Tasks"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Available tasks", z.array(TaskResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/tickler",
  summary: "List deferred/tickler tasks",
  tags: ["Tasks"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Tickler tasks", z.array(TaskResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/complete",
  summary: "Mark task complete (triggers cascade)",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Completed task", TaskResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/uncomplete",
  summary: "Revert task to previous status",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Uncompleted task", TaskResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/history",
  summary: "Get task event history",
  tags: ["Tasks", "History"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Task history events", z.array(ActivityFeedEvent)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/cascade-trace",
  summary: "Trace cascade chain from task completion",
  tags: ["Tasks", "History"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Cascade trace", z.object({
      events: z.array(ActivityFeedEvent),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/dependencies",
  summary: "List task dependencies",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Dependencies", z.object({
      predecessors: z.array(z.object({ id: z.string(), predecessorId: z.string(), type: z.string(), lagMinutes: z.number() })),
      successors: z.array(z.object({ id: z.string(), successorId: z.string(), type: z.string(), lagMinutes: z.number() })),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/dependencies",
  summary: "Add a task dependency",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(addDependencySchema) },
  },
  responses: {
    "201": jsonResponse("Created dependency", z.object({ id: z.string() })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/tasks/{id}/revert",
  summary: "Revert task to a previous snapshot",
  tags: ["Tasks", "History"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(z.object({ snapshotId: z.string(), message: z.string().optional() })) },
  },
  responses: {
    "200": jsonResponse("Reverted task", TaskResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/snapshots",
  summary: "List task snapshots",
  tags: ["Tasks", "History"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Snapshots", z.array(z.object({
      id: z.string(),
      taskId: z.string(),
      state: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }))),
    ...errorResponses,
  },
});

// Bulk operations
registry.registerPath({
  method: "patch",
  path: "/api/tasks/bulk",
  summary: "Bulk update tasks",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        ids: z.array(z.string()),
        updates: z.record(z.string(), z.unknown()),
      })),
    },
  },
  responses: {
    "200": jsonResponse("Updated tasks", z.object({ updated: z.number() })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/tasks/bulk",
  summary: "Bulk delete tasks",
  tags: ["Tasks"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({ ids: z.array(z.string()) })),
    },
  },
  responses: {
    "200": jsonResponse("Deleted tasks", z.object({ deleted: z.number() })),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/projects",
  summary: "List projects",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    query: z.object({
      status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "DROPPED", "SOMEDAY_MAYBE"]).optional(),
      areaId: z.string().optional(),
      someday: z.enum(["true", "false"]).optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Project list", z.array(ProjectResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects",
  summary: "Create a project",
  tags: ["Projects"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createProjectSchema) } },
  responses: {
    "201": jsonResponse("Created project", ProjectResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}",
  summary: "Get a project",
  tags: ["Projects"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Project detail", ProjectResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}",
  summary: "Update a project",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateProjectSchema) },
  },
  responses: {
    "200": jsonResponse("Updated project", ProjectResponse),
    "409": jsonResponse("Version conflict", ConflictResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/projects/{id}",
  summary: "Delete a project",
  tags: ["Projects"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/tasks",
  summary: "List tasks in a project",
  tags: ["Projects", "Tasks"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Project tasks", z.array(TaskResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/tasks",
  summary: "Add a task to a project",
  tags: ["Projects", "Tasks"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(createTaskSchema) },
  },
  responses: {
    "201": jsonResponse("Created task", TaskResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/create-with-tasks",
  summary: "Create project with initial tasks",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(createProjectSchema.extend({
        tasks: z.array(z.object({ title: z.string() })).optional(),
      })),
    },
  },
  responses: {
    "201": jsonResponse("Created project with tasks", ProjectResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/children",
  summary: "Create a sub-project",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(createSubProjectSchema) },
  },
  responses: {
    "201": jsonResponse("Created sub-project", ProjectResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}/children/reorder",
  summary: "Reorder sub-projects",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(reorderChildrenSchema) },
  },
  responses: {
    "200": jsonResponse("Reordered", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}/move",
  summary: "Move project under a new parent",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(moveProjectSchema) },
  },
  responses: {
    "200": jsonResponse("Moved project", ProjectResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/history",
  summary: "Get project event history",
  tags: ["Projects", "History"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Project history", z.array(ActivityFeedEvent)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/baseline",
  summary: "List project baselines",
  tags: ["Projects"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Baselines", z.array(z.object({
      id: z.string(), name: z.string(), createdAt: z.string(),
    }))),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/baseline",
  summary: "Capture a project baseline snapshot",
  tags: ["Projects"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(captureBaselineSchema) },
  },
  responses: {
    "201": jsonResponse("Created baseline", z.object({
      id: z.string(), name: z.string(), createdAt: z.string(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/outline",
  summary: "Get project outline tree",
  tags: ["Projects"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Project outline tree", z.array(z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      children: z.array(z.unknown()),
    }))),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INBOX
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/inbox",
  summary: "List inbox items",
  tags: ["Inbox"],
  security: bearerSecurity,
  request: {
    query: z.object({
      status: z.enum(["all", "UNPROCESSED", "PROCESSED"]).optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Inbox items", z.array(InboxItemResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/inbox",
  summary: "Capture an inbox item",
  tags: ["Inbox"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createInboxItemSchema) } },
  responses: {
    "201": jsonResponse("Created inbox item", InboxItemResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/inbox/{id}",
  summary: "Update an inbox item",
  tags: ["Inbox"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateInboxItemSchema) },
  },
  responses: {
    "200": jsonResponse("Updated inbox item", InboxItemResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/inbox/{id}",
  summary: "Delete an inbox item",
  tags: ["Inbox"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/inbox/{id}/process",
  summary: "Process an inbox item",
  tags: ["Inbox"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Processed inbox item", InboxItemResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/contexts",
  summary: "List contexts",
  tags: ["Contexts"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Contexts", z.array(ContextResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/contexts",
  summary: "Create a context",
  tags: ["Contexts"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createContextSchema) } },
  responses: {
    "201": jsonResponse("Created context", ContextResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/contexts/{id}",
  summary: "Update a context",
  tags: ["Contexts"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateContextSchema) },
  },
  responses: {
    "200": jsonResponse("Updated context", ContextResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/contexts/{id}",
  summary: "Delete a context",
  tags: ["Contexts"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// AREAS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/areas",
  summary: "List areas of focus",
  tags: ["Areas"],
  security: bearerSecurity,
  request: {
    query: z.object({ active: z.enum(["true", "false"]).optional() }),
  },
  responses: {
    "200": jsonResponse("Areas", z.array(AreaResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/areas",
  summary: "Create an area",
  tags: ["Areas"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createAreaSchema) } },
  responses: {
    "201": jsonResponse("Created area", AreaResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/areas/{id}",
  summary: "Get an area",
  tags: ["Areas"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Area detail", AreaResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/areas/{id}",
  summary: "Update an area",
  tags: ["Areas"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateAreaSchema) },
  },
  responses: {
    "200": jsonResponse("Updated area", AreaResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/areas/{id}",
  summary: "Delete an area",
  tags: ["Areas"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/goals",
  summary: "List goals",
  tags: ["Goals"],
  security: bearerSecurity,
  request: {
    query: z.object({
      horizon: z.enum(["RUNWAY", "HORIZON_1", "HORIZON_2", "HORIZON_3", "HORIZON_4", "HORIZON_5"]).optional(),
      status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"]).optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Goals", z.array(GoalResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/goals",
  summary: "Create a goal",
  tags: ["Goals"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createGoalSchema) } },
  responses: {
    "201": jsonResponse("Created goal", GoalResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/goals/{id}",
  summary: "Get a goal",
  tags: ["Goals"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Goal detail", GoalResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/goals/{id}",
  summary: "Update a goal",
  tags: ["Goals"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateGoalSchema) },
  },
  responses: {
    "200": jsonResponse("Updated goal", GoalResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/goals/{id}",
  summary: "Delete a goal",
  tags: ["Goals"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// WAITING FOR
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/waiting-for",
  summary: "List waiting-for items",
  tags: ["Waiting For"],
  security: bearerSecurity,
  request: {
    query: z.object({ resolved: z.enum(["true", "false", "all"]).optional() }),
  },
  responses: {
    "200": jsonResponse("Waiting-for items", z.array(WaitingForResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/waiting-for",
  summary: "Create a waiting-for item",
  tags: ["Waiting For"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createWaitingForSchema) } },
  responses: {
    "201": jsonResponse("Created waiting-for", WaitingForResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/waiting-for/{id}",
  summary: "Update a waiting-for item",
  tags: ["Waiting For"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateWaitingForSchema) },
  },
  responses: {
    "200": jsonResponse("Updated waiting-for", WaitingForResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/waiting-for/{id}",
  summary: "Delete a waiting-for item",
  tags: ["Waiting For"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/reviews",
  summary: "List weekly reviews",
  tags: ["Reviews"],
  security: bearerSecurity,
  request: {
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Reviews", ReviewListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/reviews",
  summary: "Start a new weekly review",
  tags: ["Reviews"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createReviewSchema) } },
  responses: {
    "201": jsonResponse("Created review", WeeklyReviewResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/reviews/current",
  summary: "Get the in-progress weekly review",
  tags: ["Reviews"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Current review", WeeklyReviewResponse.nullable()),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/reviews/{id}",
  summary: "Get a weekly review",
  tags: ["Reviews"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Review detail", WeeklyReviewResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/reviews/{id}",
  summary: "Update a weekly review",
  tags: ["Reviews"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateReviewSchema) },
  },
  responses: {
    "200": jsonResponse("Updated review", WeeklyReviewResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/reviews/{id}/complete",
  summary: "Mark a weekly review complete",
  tags: ["Reviews"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Completed review", WeeklyReviewResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/reviews/{id}",
  summary: "Delete a weekly review",
  tags: ["Reviews"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HORIZONS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/horizon-notes",
  summary: "List horizon notes",
  tags: ["Horizons"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Horizon notes", z.array(HorizonNoteResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/horizon-notes",
  summary: "Create or update a horizon note",
  tags: ["Horizons"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        level: z.enum(["RUNWAY", "HORIZON_1", "HORIZON_2", "HORIZON_3", "HORIZON_4", "HORIZON_5"]),
        title: z.string().optional(),
        content: z.string(),
      })),
    },
  },
  responses: {
    "200": jsonResponse("Upserted horizon note", HorizonNoteResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// WIKI
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/wiki",
  summary: "List or search wiki articles",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: {
    query: z.object({
      search: z.string().optional(),
      tag: z.string().optional(),
      teamId: z.string().optional(),
      scope: z.enum(["all"]).optional(),
      includePersonal: z.enum(["true"]).optional(),
      before: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Wiki articles", WikiArticleListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/wiki",
  summary: "Create a wiki article",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        title: z.string(),
        slug: z.string().optional(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
        teamId: z.string().nullable().optional(),
      })),
    },
  },
  responses: {
    "201": jsonResponse("Created article", WikiArticleResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/wiki/{slug}",
  summary: "Get a wiki article",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: { params: slugParam },
  responses: {
    "200": jsonResponse("Article content", WikiArticleResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/wiki/{slug}",
  summary: "Update a wiki article",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: {
    params: slugParam,
    body: {
      required: true,
      ...jsonContent(z.object({
        title: z.string().optional(),
        slug: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        message: z.string().optional(),
        version: z.number().optional(),
      })),
    },
  },
  responses: {
    "200": jsonResponse("Updated article", WikiArticleResponse),
    "409": jsonResponse("Version conflict", ConflictResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/wiki/{slug}",
  summary: "Delete a wiki article",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: { params: slugParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/wiki/{slug}/backlinks",
  summary: "Get articles that link to this article",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: { params: slugParam },
  responses: {
    "200": jsonResponse("Backlinks", z.array(z.object({
      id: z.string(), slug: z.string(), title: z.string(),
    }))),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/wiki/{slug}/history",
  summary: "Get wiki article version history",
  tags: ["Wiki", "History"],
  security: bearerSecurity,
  request: { params: slugParam },
  responses: {
    "200": jsonResponse("Version history", z.array(z.object({
      id: z.string(),
      version: z.number(),
      title: z.string(),
      message: z.string().nullable(),
      createdAt: z.string(),
    }))),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/wiki/move",
  summary: "Move/rename a wiki article",
  tags: ["Wiki"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        slug: z.string(),
        newSlug: z.string().optional(),
        newTeamId: z.string().nullable().optional(),
      })),
    },
  },
  responses: {
    "200": jsonResponse("Moved article", WikiArticleResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/teams",
  summary: "List user's teams",
  tags: ["Teams"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Teams", TeamListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/teams",
  summary: "Create a team",
  tags: ["Teams"],
  security: bearerSecurity,
  request: { body: { required: true, ...jsonContent(createTeamSchema) } },
  responses: {
    "201": jsonResponse("Created team", TeamResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/teams/{id}",
  summary: "Get a team",
  tags: ["Teams"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Team detail", TeamResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/teams/{id}",
  summary: "Update a team",
  tags: ["Teams"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(updateTeamSchema) },
  },
  responses: {
    "200": jsonResponse("Updated team", TeamResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/teams/{id}",
  summary: "Delete a team",
  tags: ["Teams"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/teams/{id}/members",
  summary: "Add a team member",
  tags: ["Teams"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: { required: true, ...jsonContent(addTeamMemberSchema) },
  },
  responses: {
    "201": jsonResponse("Added member", z.object({
      id: z.string(), userId: z.string(), role: z.string(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/teams/{id}/members/{userId}",
  summary: "Update a team member",
  tags: ["Teams"],
  security: bearerSecurity,
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Team ID" }),
      userId: z.string().openapi({ description: "Member user ID" }),
    }),
    body: { required: true, ...jsonContent(updateTeamMemberSchema) },
  },
  responses: {
    "200": jsonResponse("Updated member", z.object({
      id: z.string(), userId: z.string(), role: z.string(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/teams/{id}/members/{userId}",
  summary: "Remove a team member",
  tags: ["Teams"],
  security: bearerSecurity,
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Team ID" }),
      userId: z.string().openapi({ description: "Member user ID" }),
    }),
  },
  responses: {
    "200": jsonResponse("Removed", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/notifications",
  summary: "List notifications",
  tags: ["Notifications"],
  security: bearerSecurity,
  request: {
    query: z.object({
      unreadOnly: z.enum(["true"]).optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Notifications", z.array(NotificationResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/notifications/{id}",
  summary: "Mark notification as read",
  tags: ["Notifications"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Updated notification", NotificationResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/notifications/mark-all-read",
  summary: "Mark all notifications as read",
  tags: ["Notifications"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("All marked read", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/notifications/unread-count",
  summary: "Get unread notification count",
  tags: ["Notifications"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Unread count", z.object({ count: z.number() })),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY / ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/history/feed",
  summary: "Get activity feed",
  tags: ["History"],
  security: bearerSecurity,
  request: {
    query: z.object({
      days: z.string().optional(),
      limit: z.string().optional(),
      source: z.enum(["all", "manual", "ai", "cascade"]).optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Activity feed", z.array(ActivityFeedEvent)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/history/weekly-summary",
  summary: "Get weekly activity summary",
  tags: ["History"],
  security: bearerSecurity,
  request: {
    query: z.object({ weekOf: z.string().optional() }),
  },
  responses: {
    "200": jsonResponse("Weekly summary", z.object({
      weekOf: z.string(),
      tasksCompleted: z.number(),
      tasksCreated: z.number(),
      projectsCompleted: z.number(),
    })),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/search",
  summary: "Full-text search across tasks, projects, wiki, inbox",
  tags: ["Search"],
  security: bearerSecurity,
  request: {
    query: z.object({
      q: z.string().openapi({ description: "Search query" }),
      scope: z.enum(["all", "tasks", "projects", "wiki", "inbox"]).optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    "200": jsonResponse("Search results", SearchResultsResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/dashboard/stats",
  summary: "Get dashboard statistics",
  tags: ["Dashboard"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Dashboard stats", z.object({
      health: z.record(z.string(), z.unknown()),
      progress: z.record(z.string(), z.unknown()),
      velocity: z.record(z.string(), z.unknown()),
      blockedQueue: z.array(z.unknown()),
      staleProjects: z.array(z.unknown()),
    })),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/export",
  summary: "Export user data (JSON or CSV)",
  tags: ["Import/Export"],
  security: bearerSecurity,
  request: {
    query: z.object({
      format: z.enum(["json", "csv"]).optional(),
    }),
  },
  responses: {
    "200": { description: "Exported data (JSON or CSV)" },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/import/upload",
  summary: "Upload a file for import preview",
  tags: ["Import/Export"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({ file: z.string().openapi({ description: "File to import" }) }),
        },
      },
    },
  },
  responses: {
    "200": jsonResponse("Import job created", z.object({
      jobId: z.string(),
      preview: z.record(z.string(), z.unknown()),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/import/{jobId}",
  summary: "Get import job status",
  tags: ["Import/Export"],
  security: bearerSecurity,
  request: {
    params: z.object({ jobId: z.string().openapi({ description: "Import job ID" }) }),
  },
  responses: {
    "200": jsonResponse("Import job", z.object({
      id: z.string(),
      status: z.string(),
      result: z.record(z.string(), z.unknown()).nullable(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/import/{jobId}/confirm",
  summary: "Confirm and process import",
  tags: ["Import/Export"],
  security: bearerSecurity,
  request: {
    params: z.object({ jobId: z.string() }),
  },
  responses: {
    "200": jsonResponse("Import result", z.object({
      imported: z.number(),
      skipped: z.number(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/import/{jobId}/cancel",
  summary: "Cancel an import job",
  tags: ["Import/Export"],
  security: bearerSecurity,
  request: {
    params: z.object({ jobId: z.string() }),
  },
  responses: {
    "200": jsonResponse("Cancelled", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/insights",
  summary: "Get productivity analytics and system health",
  tags: ["Insights"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Insights data", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/insights/export",
  summary: "Export insights data",
  tags: ["Insights"],
  security: bearerSecurity,
  responses: {
    "200": { description: "Insights export (JSON or CSV)" },
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// AI
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/ai/context",
  summary: "Get AI context (what should I do now?)",
  description: "Returns recommended next actions filtered by context, energy, and available time.",
  tags: ["AI"],
  security: bearerSecurity,
  request: {
    query: z.object({
      contexts: z.string().optional().openapi({ description: "Comma-separated context names" }),
      energyLevel: z.enum(["low", "medium", "high"]).optional(),
      availableTime: z.string().optional().openapi({ description: "Minutes available" }),
    }),
  },
  responses: {
    "200": jsonResponse("AI context", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/ai/inbox/capture",
  summary: "AI-powered inbox capture",
  tags: ["AI", "Inbox"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        items: z.array(z.string()),
        source: z.enum(["MCP", "AI_EMBED"]).optional(),
      })),
    },
  },
  responses: {
    "201": jsonResponse("Captured items", z.object({
      items: z.array(InboxItemResponse),
      count: z.number(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/ai/scaffold-project",
  summary: "AI project scaffolding",
  description: "Suggests task order, types, and dependencies using AI. Uses the user's own AI key.",
  tags: ["AI", "Projects"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        projectTitle: z.string(),
        projectDescription: z.string().optional(),
        tasks: z.array(z.object({ title: z.string() })),
      })),
    },
  },
  responses: {
    "200": jsonResponse("Scaffold suggestion", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/ai/chat",
  summary: "Chat with AI assistant (streaming)",
  description: "Streaming SSE endpoint. Uses the user's own AI key.",
  tags: ["AI"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })),
        context: z.string().optional(),
      })),
    },
  },
  responses: {
    "200": { description: "SSE stream of AI responses (text/event-stream)" },
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/settings/features",
  summary: "Get feature flags",
  tags: ["Settings"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Feature flags", FeatureFlagsResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/settings/api-tokens",
  summary: "List API tokens",
  description: "Returns token metadata (never exposes hashes or secrets).",
  tags: ["Settings"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("API tokens", z.array(ApiTokenResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/settings/api-tokens",
  summary: "Create an API token",
  description: "Session-only (no Bearer). Returns the plaintext token exactly once.",
  tags: ["Settings"],
  responses: {
    "201": jsonResponse("Created token with plaintext", ApiTokenCreatedResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/settings/api-tokens/{id}",
  summary: "Revoke an API token",
  description: "Session-only (no Bearer).",
  tags: ["Settings"],
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Revoked", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTINES
// ═══════════════════════════════════════════════════════════════════════════

const healthWindowItemSchema = z.object({
  name: z.string(),
  dosage: z.string().nullable().optional(),
  form: z.enum(["capsule", "softgel", "tablet", "powder", "liquid", "gummy", "patch", "injection"]).nullable().optional(),
  sortOrder: z.number().int().default(0),
  notes: z.string().nullable().optional(),
  rampSchedule: z.object({
    type: z.literal("step"),
    steps: z.array(z.object({
      fromDay: z.number().int().min(1),
      toDay: z.number().int().min(1),
      dosage: z.string(),
    })),
  }).nullable().optional(),
}).openapi("RoutineWindowItem");

const healthWindowSchema = z.object({
  title: z.string(),
  targetTime: z.string().nullable().optional().openapi({ description: "HH:MM format" }),
  sortOrder: z.number().int().default(0),
  constraint: z.string().nullable().optional().openapi({ description: "e.g. empty_stomach, with_food, before_bed" }),
  items: z.array(healthWindowItemSchema).default([]),
}).openapi("RoutineWindow");

const routineCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  cronExpression: z.string().default("daily").openapi({ description: "Schedule expression (daily, weekdays, weekly:1, etc.)" }),
  schedule: z.string().optional().openapi({ description: "Alias for cronExpression" }),
  color: z.string().nullable().optional(),
  estimatedMins: z.number().int().nullable().optional(),
  areaId: z.string().nullable().optional(),
  routineType: z.enum(["static", "dynamic"]).default("static"),
  startDate: z.string().nullable().optional().openapi({ description: "ISO date string (dynamic protocols only)" }),
  totalDays: z.number().int().min(1).nullable().optional().openapi({ description: "Total days in protocol (dynamic only)" }),
  windows: z.array(healthWindowSchema).default([]),
}).openapi("RoutineCreate");

const routineResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  cronExpression: z.string(),
  isActive: z.boolean(),
  color: z.string().nullable(),
  estimatedMins: z.number().nullable(),
  routineType: z.string(),
  startDate: z.string().nullable(),
  totalDays: z.number().nullable(),
  nextDue: z.string().nullable(),
  lastGenerated: z.string().nullable(),
  createdAt: z.string(),
  windows: z.array(z.object({
    id: z.string(),
    title: z.string(),
    targetTime: z.string().nullable(),
    sortOrder: z.number(),
    constraint: z.string().nullable(),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      dosage: z.string().nullable(),
      form: z.string().nullable(),
      notes: z.string().nullable(),
      rampSchedule: z.unknown().nullable(),
    })),
  })),
}).openapi("Routine");

registry.registerPath({
  method: "get",
  path: "/api/routines",
  summary: "List all routines",
  tags: ["Routines"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Routines", z.array(routineResponseSchema)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/routines",
  summary: "Create a routine with windows and items",
  description: "Creates a routine and immediately generates today's card in the Card File if the schedule matches today.",
  tags: ["Routines"],
  security: bearerSecurity,
  request: {
    body: {
      content: { "application/json": { schema: routineCreateSchema } },
    },
  },
  responses: {
    "201": jsonResponse("Created routine", routineResponseSchema),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/routines/{id}",
  summary: "Get a routine",
  tags: ["Routines"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Routine", routineResponseSchema),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/routines/{id}",
  summary: "Update a routine",
  tags: ["Routines"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: routineCreateSchema.partial() } },
    },
  },
  responses: {
    "200": jsonResponse("Updated routine", routineResponseSchema),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/routines/{id}",
  summary: "Delete a routine and its windows/items",
  tags: ["Routines"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", z.object({ deleted: z.boolean() })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/routines/{id}/log",
  summary: "Log a window completion for today",
  tags: ["Routines"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: z.object({
        windowId: z.string(),
        date: z.string().openapi({ description: "ISO date string" }),
        status: z.enum(["completed", "skipped"]),
      }) } },
    },
  },
  responses: {
    "200": jsonResponse("Log entry", z.object({
      log: z.record(z.string(), z.unknown()),
      allWindowsComplete: z.boolean(),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/routines/{id}/log",
  summary: "Toggle an individual item within a window log",
  tags: ["Routines"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: z.object({
        windowId: z.string(),
        date: z.string(),
        itemId: z.string(),
        taken: z.boolean(),
      }) } },
    },
  },
  responses: {
    "200": jsonResponse("Updated log", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PUSH SUBSCRIPTIONS & NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "post",
  path: "/api/push-subscriptions",
  summary: "Subscribe to push notifications",
  tags: ["Notifications"],
  security: bearerSecurity,
  request: {
    body: {
      required: true,
      ...jsonContent(z.object({
        endpoint: z.string(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      })),
    },
  },
  responses: {
    "201": jsonResponse("Subscribed", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/push-subscriptions",
  summary: "Unsubscribe from push notifications",
  tags: ["Notifications"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Unsubscribed", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/notification-preferences",
  summary: "Get notification preferences",
  tags: ["Notifications"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Preferences", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/notification-preferences",
  summary: "Update notification preferences",
  tags: ["Notifications"],
  security: bearerSecurity,
  request: {
    body: { required: true, ...jsonContent(z.record(z.string(), z.unknown())) },
  },
  responses: {
    "200": jsonResponse("Updated preferences", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HORIZON REVIEWS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/horizon-reviews",
  summary: "List horizon reviews",
  tags: ["Horizons"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Horizon reviews", z.array(z.record(z.string(), z.unknown()))),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/horizon-reviews",
  summary: "Start a horizon review",
  tags: ["Horizons"],
  security: bearerSecurity,
  responses: {
    "201": jsonResponse("Created horizon review", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/horizon-reviews/current",
  summary: "Get in-progress horizon review",
  tags: ["Horizons"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Current horizon review", z.record(z.string(), z.unknown()).nullable()),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/horizon-reviews/{id}",
  summary: "Get a horizon review",
  tags: ["Horizons"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Horizon review", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/horizon-reviews/{id}",
  summary: "Update a horizon review",
  tags: ["Horizons"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Updated horizon review", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/horizon-reviews/{id}/complete",
  summary: "Complete a horizon review",
  tags: ["Horizons"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Completed horizon review", z.record(z.string(), z.unknown())),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/project-templates",
  summary: "List project templates",
  description: "Returns system templates, team templates for the user's teams, and personal templates. Hidden templates are excluded unless ?showHidden=true is set.",
  tags: ["Templates"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Template list", z.array(ProjectTemplateResponse)),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/project-templates",
  summary: "Create a project template",
  tags: ["Templates"],
  security: bearerSecurity,
  request: { body: jsonContent(createProjectTemplateSchema) },
  responses: {
    "201": jsonResponse("Template created", ProjectTemplateResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/project-templates/{id}",
  summary: "Get project template details",
  tags: ["Templates"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Template details", ProjectTemplateResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/project-templates/{id}",
  summary: "Delete a user or team template",
  description: "Personal templates: owner can delete. Team templates: team admin can delete. System templates return 403.",
  tags: ["Templates"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/project-templates/{id}/instantiate",
  summary: "Create a project from a template",
  description: "Instantiates the template with provided variable values, creating a project with all tasks.",
  tags: ["Templates"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(instantiateTemplateSchema),
  },
  responses: {
    "201": jsonResponse("Project created from template", ProjectResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/save-as-template",
  summary: "Save a project as a template",
  description: "Captures the project's structure (tasks, sub-projects) as a reusable template. Pass teamId in the body to save as a team template.",
  tags: ["Templates"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(saveAsTemplateSchema),
  },
  responses: {
    "201": jsonResponse("Template created from project", ProjectTemplateResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/project-templates/{id}/hide",
  summary: "Hide a template",
  description: "Hides a system or team template from the current user's template library. Personal templates cannot be hidden (delete them instead).",
  tags: ["Templates"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Template hidden", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/project-templates/{id}/hide",
  summary: "Unhide a template",
  description: "Removes the hidden status on a previously hidden template, making it visible again in the user's template library.",
  tags: ["Templates"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Template unhidden", SuccessResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HELP ARTICLES
// ═══════════════════════════════════════════════════════════════════════════

const HelpArticleSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  sortOrder: z.number(),
  adminOnly: z.boolean(),
  updatedAt: z.string(),
  snippet: z.string().optional(),
}).openapi("HelpArticleSummary");

const HelpArticleResponse = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  content: z.string().openapi({ description: "Full article content in Markdown" }),
  category: z.string(),
  tags: z.array(z.string()),
  sortOrder: z.number(),
  adminOnly: z.boolean(),
  isPublished: z.boolean(),
  updatedAt: z.string(),
}).openapi("HelpArticle");

registry.registerPath({
  method: "get",
  path: "/api/help",
  summary: "List help articles",
  description: "Returns all published help articles. Supports filtering by category, tag, or search query. Admin-only articles are hidden from non-admin users.",
  tags: ["Help"],
  security: bearerSecurity,
  request: {
    query: z.object({
      category: z.string().optional().openapi({ description: "Filter by category (e.g. 'Getting Started', 'Features')" }),
      tag: z.string().optional().openapi({ description: "Filter by tag" }),
      search: z.string().optional().openapi({ description: "Search in title and content" }),
    }),
  },
  responses: {
    "200": jsonResponse("Help articles", z.object({
      articles: z.array(HelpArticleSummary),
      categories: z.array(z.object({
        name: z.string(),
        count: z.number(),
      })),
    })),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/help/{slug}",
  summary: "Get a help article",
  description: "Returns the full content of a help article by slug. Content is in Markdown format.",
  tags: ["Help"],
  security: bearerSecurity,
  request: {
    params: z.object({
      slug: z.string().openapi({ description: "Article slug (e.g. 'public-rest-api', 'getting-started')" }),
    }),
  },
  responses: {
    "200": jsonResponse("Help article", HelpArticleResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// THREADS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "post",
  path: "/api/threads",
  summary: "Create a thread",
  description: "Create a discussion thread on a task or project. Requires team membership. Exactly one of taskId or projectId must be provided.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: { body: jsonContent(createThreadSchema) },
  responses: {
    "201": jsonResponse("Created thread", ThreadResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/threads/{id}",
  summary: "Get thread details",
  description: "Returns a thread with all messages. Requires team membership.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Thread with messages", ThreadResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/threads/{id}",
  summary: "Update or resolve a thread",
  description: "Update thread title, or resolve/unresolve. Send `{ resolve: true }` to resolve, `{ resolve: false }` to unresolve.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(z.object({
      title: z.string().optional(),
      resolve: z.boolean().optional(),
    })),
  },
  responses: {
    "200": jsonResponse("Updated thread", ThreadResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/threads/{id}",
  summary: "Delete a thread",
  description: "Delete a thread and all its messages. Only the thread creator can delete.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/threads/{id}/messages",
  summary: "Add a message to a thread",
  description: "Reply to an existing thread. If the thread was resolved, replying reopens it.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(addMessageSchema),
  },
  responses: {
    "201": jsonResponse("Created message", ThreadMessageResponse),
    ...errorResponses,
  },
});

const threadMessageParams = z.object({
  id: z.string().openapi({ description: "Thread ID" }),
  mid: z.string().openapi({ description: "Message ID" }),
});

registry.registerPath({
  method: "patch",
  path: "/api/threads/{id}/messages/{mid}",
  summary: "Edit a thread message",
  description: "Edit your own message in a thread.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: {
    params: threadMessageParams,
    body: jsonContent(updateMessageSchema),
  },
  responses: {
    "200": jsonResponse("Updated message", ThreadMessageResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/threads/{id}/messages/{mid}",
  summary: "Delete a thread message",
  description: "Delete your own message from a thread.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: { params: threadMessageParams },
  responses: {
    "200": jsonResponse("Deleted", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/threads/mentions",
  summary: "Get threads mentioning you",
  description: "Returns unresolved threads where the authenticated user was @-mentioned.",
  tags: ["Threads"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Mentioned threads", ThreadListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/threads",
  summary: "List threads for a project",
  description: "Returns all threads anchored to a project. Requires team membership.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Project threads", ThreadListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/tasks/{id}/threads",
  summary: "List threads for a task",
  description: "Returns all threads anchored to a task. Requires team membership.",
  tags: ["Threads"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Task threads", ThreadListResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "post",
  path: "/api/decisions",
  summary: "Create a decision",
  description: "Create an approval or poll decision on a task or project. Requires team membership. For POLL type, provide 2+ options.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: { body: jsonContent(createDecisionSchema) },
  responses: {
    "201": jsonResponse("Created decision", DecisionResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/decisions/{id}",
  summary: "Get decision details",
  description: "Returns full decision with respondents, responses, options, and votes. Requires team membership.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Decision details", DecisionResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/decisions/{id}",
  summary: "Resolve or withdraw a decision",
  description: "Resolve with `{ resolution, chosenOptionId? }` or withdraw with `{ withdraw: true }`. Only the requester can resolve or withdraw.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(z.union([
      resolveDecisionSchema,
      z.object({ withdraw: z.literal(true) }),
    ])),
  },
  responses: {
    "200": jsonResponse("Updated decision", DecisionResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/decisions/{id}/respond",
  summary: "Vote on an approval decision",
  description: "Submit a vote (APPROVE, REJECT, COMMENT, DEFER) with optional comment. Only designated respondents can vote. Calling again updates your vote.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(respondDecisionSchema),
  },
  responses: {
    "200": jsonResponse("Vote recorded", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/decisions/{id}/vote-option",
  summary: "Vote on a poll option",
  description: "Vote for a specific option in a POLL decision. One vote per person, changeable. Only designated respondents can vote.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: {
    params: idParam,
    body: jsonContent(voteOptionSchema),
  },
  responses: {
    "200": jsonResponse("Vote recorded", SuccessResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/decisions/pending",
  summary: "List pending decisions",
  description: "Returns open decisions where the authenticated user is a respondent and has not yet voted.",
  tags: ["Decisions"],
  security: bearerSecurity,
  responses: {
    "200": jsonResponse("Pending decisions", DecisionListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/decisions",
  summary: "List decisions for a project",
  description: "Returns all decisions for a team project, ordered by status (open first) then date.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Project decisions", DecisionListResponse),
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/teams/{id}/decisions",
  summary: "List decisions for a team",
  description: "Returns decisions across all team projects, ordered by status then date.",
  tags: ["Decisions"],
  security: bearerSecurity,
  request: { params: idParam },
  responses: {
    "200": jsonResponse("Team decisions", DecisionListResponse),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/teams/{id}/activity",
  summary: "Team activity feed",
  description: "Aggregated activity feed across all team projects. Supports filtering by category (threads, decisions, tasks, projects) and person.",
  tags: ["Teams"],
  security: bearerSecurity,
  request: {
    params: idParam,
    query: z.object({
      limit: z.string().optional().openapi({ description: "Max events (default 50, max 200)" }),
      before: z.string().optional().openapi({ description: "ISO timestamp cursor for pagination" }),
      category: z.enum(["threads", "decisions", "tasks", "projects"]).optional(),
      actorId: z.string().optional().openapi({ description: "Filter to a specific user" }),
    }),
  },
  responses: {
    "200": jsonResponse("Activity feed", z.object({
      events: z.array(ActivityFeedEvent),
      hasMore: z.boolean(),
      actors: z.array(z.object({ id: z.string(), name: z.string() })),
    })),
    ...errorResponses,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC (no auth)
// ═══════════════════════════════════════════════════════════════════════════

registry.registerPath({
  method: "get",
  path: "/api/health",
  summary: "Health check",
  tags: ["Public"],
  responses: {
    "200": jsonResponse("Healthy", z.object({
      status: z.literal("ok"),
      database: z.literal("connected"),
    })),
  },
});
