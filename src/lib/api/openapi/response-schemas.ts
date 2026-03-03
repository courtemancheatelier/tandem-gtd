/**
 * OpenAPI response schemas — Zod schemas mirroring the actual JSON shapes
 * returned by API route handlers. These are used in the OpenAPI registry
 * to document response bodies.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const dateString = z.string().datetime();
const nullableDateString = z.string().datetime().nullable();
const id = z.string();

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const TaskProjectRef = z.object({
  id,
  title: z.string(),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "DROPPED", "SOMEDAY_MAYBE"]),
});

export const TaskContextRef = z.object({
  id,
  name: z.string(),
  color: z.string().nullable(),
});

export const TaskDependencyRef = z.object({
  id,
  title: z.string(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DROPPED"]),
});

export const TaskResponse = z.object({
  id,
  title: z.string(),
  notes: z.string().nullable(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DROPPED"]),
  projectId: z.string().nullable(),
  contextId: z.string().nullable(),
  userId: z.string(),
  estimatedMins: z.number().nullable(),
  energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  scheduledDate: nullableDateString,
  dueDate: nullableDateString,
  sortOrder: z.number(),
  isNextAction: z.boolean(),
  isMilestone: z.boolean(),
  percentComplete: z.number(),
  actualMinutes: z.number().nullable(),
  version: z.number(),
  createdAt: dateString,
  updatedAt: dateString,
  completedAt: nullableDateString,
  project: TaskProjectRef.nullable(),
  context: TaskContextRef.nullable(),
});

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectAreaRef = z.object({
  id,
  name: z.string(),
});

export const ProjectGoalRef = z.object({
  id,
  title: z.string(),
});

export const ProjectTeamRef = z.object({
  id,
  name: z.string(),
  icon: z.string().nullable(),
});

export const ProjectTaskCounts = z.object({
  total: z.number(),
  completed: z.number(),
  active: z.number(),
});

export const ProjectResponse = z.object({
  id,
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "DROPPED", "SOMEDAY_MAYBE"]),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]),
  childType: z.enum(["SEQUENTIAL", "PARALLEL"]),
  outcome: z.string().nullable(),
  isSomedayMaybe: z.boolean(),
  sortOrder: z.number(),
  userId: z.string(),
  areaId: z.string().nullable(),
  goalId: z.string().nullable(),
  teamId: z.string().nullable(),
  parentProjectId: z.string().nullable(),
  version: z.number(),
  createdAt: dateString,
  updatedAt: dateString,
  area: ProjectAreaRef.nullable(),
  goal: ProjectGoalRef.nullable(),
  parentProject: z.object({ id, title: z.string() }).nullable(),
  team: ProjectTeamRef.nullable(),
  taskCounts: ProjectTaskCounts,
});

// ---------------------------------------------------------------------------
// Inbox Item
// ---------------------------------------------------------------------------

export const InboxItemResponse = z.object({
  id,
  content: z.string(),
  notes: z.string().nullable(),
  status: z.enum(["UNPROCESSED", "PROCESSED"]),
  userId: z.string(),
  createdAt: dateString,
  updatedAt: dateString,
});

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const ContextResponse = z.object({
  id,
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number(),
  userId: z.string(),
  createdAt: dateString,
  updatedAt: dateString,
});

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

export const AreaResponse = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  userId: z.string(),
  createdAt: dateString,
  updatedAt: dateString,
  projectCount: z.number(),
  activeProjectCount: z.number(),
  goalCount: z.number(),
});

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

export const GoalResponse = z.object({
  id,
  title: z.string(),
  description: z.string().nullable(),
  horizon: z.enum(["RUNWAY", "HORIZON_1", "HORIZON_2", "HORIZON_3", "HORIZON_4", "HORIZON_5"]),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"]),
  progress: z.number(),
  targetDate: nullableDateString,
  userId: z.string(),
  areaId: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
  area: ProjectAreaRef.nullable(),
  projectCount: z.number(),
});

// ---------------------------------------------------------------------------
// Wiki Article
// ---------------------------------------------------------------------------

export const WikiArticleListItem = z.object({
  id,
  slug: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  teamId: z.string().nullable(),
  team: ProjectTeamRef.nullable(),
  user: z.object({ id, name: z.string() }),
  createdAt: dateString,
  updatedAt: dateString,
  snippet: z.string().optional(),
});

export const WikiArticleListResponse = z.object({
  articles: z.array(WikiArticleListItem),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

export const WikiArticleResponse = z.object({
  id,
  slug: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  teamId: z.string().nullable(),
  userId: z.string(),
  version: z.number(),
  createdAt: dateString,
  updatedAt: dateString,
});

// ---------------------------------------------------------------------------
// Waiting For
// ---------------------------------------------------------------------------

export const WaitingForResponse = z.object({
  id,
  description: z.string(),
  person: z.string(),
  dueDate: nullableDateString,
  followUpDate: nullableDateString,
  isResolved: z.boolean(),
  userId: z.string(),
  createdAt: dateString,
  updatedAt: dateString,
});

// ---------------------------------------------------------------------------
// Weekly Review
// ---------------------------------------------------------------------------

export const WeeklyReviewResponse = z.object({
  id,
  weekOf: dateString,
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
  notes: z.string().nullable(),
  checklist: z.object({
    getClear: z.boolean(),
    getCurrent: z.boolean(),
    getCreative: z.boolean(),
  }),
  aiCoachUsed: z.boolean(),
  aiSummary: z.string().nullable(),
  userId: z.string(),
  createdAt: dateString,
  updatedAt: dateString,
  completedAt: nullableDateString,
});

export const ReviewListResponse = z.object({
  reviews: z.array(WeeklyReviewResponse),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export const TeamResponse = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  createdAt: dateString,
  updatedAt: dateString,
});

export const TeamListResponse = z.object({
  teams: z.array(TeamResponse),
  teamsEnabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export const NotificationResponse = z.object({
  id,
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  isRead: z.boolean(),
  actionUrl: z.string().nullable(),
  userId: z.string(),
  createdAt: dateString,
});

// ---------------------------------------------------------------------------
// Horizon Note
// ---------------------------------------------------------------------------

export const HorizonNoteResponse = z.object({
  id,
  level: z.enum(["RUNWAY", "HORIZON_1", "HORIZON_2", "HORIZON_3", "HORIZON_4", "HORIZON_5"]),
  title: z.string().nullable(),
  content: z.string(),
  userId: z.string(),
  createdAt: dateString,
  updatedAt: dateString,
});

// ---------------------------------------------------------------------------
// History / Activity
// ---------------------------------------------------------------------------

export const ActivityFeedEvent = z.object({
  id,
  type: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  description: z.string(),
  diffs: z.record(z.string(), z.unknown()).nullable(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  source: z.string(),
  createdAt: dateString,
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SearchResultsResponse = z.object({
  tasks: z.array(z.object({ id, title: z.string(), status: z.string() })).optional(),
  projects: z.array(z.object({ id, title: z.string(), status: z.string() })).optional(),
  wiki: z.array(z.object({ id, slug: z.string(), title: z.string() })).optional(),
  inbox: z.array(z.object({ id, content: z.string() })).optional(),
});

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export const ErrorResponse = z.object({
  error: z.string(),
});

export const SuccessResponse = z.object({
  success: z.literal(true),
});

export const ConflictResponse = z.object({
  error: z.literal("CONFLICT"),
  message: z.string(),
  currentVersion: z.number(),
  currentState: z.record(z.string(), z.unknown()),
});

export const FeatureFlagsResponse = z.object({
  apiAccessEnabled: z.boolean(),
});

export const ApiTokenResponse = z.object({
  id,
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: nullableDateString,
  lastUsed: nullableDateString,
  createdAt: dateString,
});

export const ApiTokenCreatedResponse = ApiTokenResponse.extend({
  plaintext: z.string(),
});

// ── Project Templates ───────────────────────────────────────────────────────

export const ProjectTemplateTaskResponse = z.object({
  id,
  title: z.string(),
  notes: z.string().nullable(),
  estimatedMins: z.number().nullable(),
  energyLevel: z.string().nullable(),
  contextName: z.string().nullable(),
  sortOrder: z.number(),
});

export const ProjectSubTemplateResponse = z.object({
  id,
  title: z.string(),
  type: z.string(),
  outcome: z.string().nullable(),
  sortOrder: z.number(),
  tasks: z.array(ProjectTemplateTaskResponse),
});

export const ProjectTemplateResponse = z.object({
  id,
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  outcome: z.string().nullable(),
  icon: z.string().nullable(),
  isSystem: z.boolean(),
  variables: z.array(z.string()),
  createdAt: dateString,
  updatedAt: dateString,
  _count: z.object({
    taskTemplates: z.number(),
    subProjectTemplates: z.number(),
  }).optional(),
  taskTemplates: z.array(ProjectTemplateTaskResponse).optional(),
  subProjectTemplates: z.array(ProjectSubTemplateResponse).optional(),
});
