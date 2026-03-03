/**
 * MCP Tool Definitions for Tandem GTD
 *
 * Tools are actions that AI assistants can execute. Each tool has a name,
 * description, input schema, and handler function.
 *
 * Tools:
 *   tandem_inbox_add              - Add item to inbox
 *   tandem_inbox_list             - List unprocessed inbox items
 *   tandem_task_create            - Create a task (with optional assignee)
 *   tandem_task_complete          - Complete a task by ID (team-aware)
 *   tandem_task_list              - List available tasks with filters (team-aware)
 *   tandem_what_now               - Get recommended next actions (team-aware)
 *   tandem_project_list           - List projects by status (team-aware)
 *   tandem_project_create         - Create a project (with optional teamId)
 *   tandem_search                 - Search across tasks, projects, inbox items (team-aware)
 *   tandem_waiting_for_list       - List waiting-for items
 *   tandem_review_status          - Get weekly review status
 *   tandem_horizon_note_list      - List horizon notes (purpose, vision, etc.)
 *   tandem_horizon_note_upsert    - Create or update a horizon note
 *   tandem_goal_list              - List goals with optional filters
 *   tandem_goal_create            - Create a new goal
 *   tandem_goal_update            - Update an existing goal
 *   tandem_area_list              - List areas of responsibility
 *   tandem_area_create            - Create a new area of responsibility
 *   tandem_horizon_review_status  - Check if a horizon review is due
 *   tandem_team_list              - List user's teams
 *   tandem_team_create            - Create a new team
 *   tandem_team_members           - List team members
 *   tandem_team_add_member        - Add member to team
 *   tandem_team_remove_member     - Remove member from team
 *   tandem_task_assign            - Assign/unassign a task
 *   tandem_task_update            - Update an existing task
 *   tandem_task_bulk_update       - Bulk update multiple tasks (context change)
 *   tandem_task_delete            - Delete a task by ID
 *   tandem_inbox_update           - Update an inbox item
 *   tandem_inbox_delete           - Delete an inbox item
 *   tandem_wiki_search            - Search wiki articles
 *   tandem_wiki_read              - Read a wiki article by slug
 *   tandem_wiki_create            - Create a wiki article
 *   tandem_wiki_update            - Update a wiki article
 *   tandem_wiki_delete            - Delete a wiki article
 *   tandem_wiki_history           - View article version history
 *   tandem_wiki_backlinks         - Find articles linking to a slug
 *   tandem_task_create_from_text  - Create a task from natural language text
 *   tandem_task_history           - View change history for a task
 *   tandem_activity_feed          - Recent activity across all entities
 *   tandem_weekly_summary         - Aggregated weekly GTD summary
 *   tandem_cascade_trace          - Trace cascade chain from task completion
 *   tandem_task_revert            - Revert a task to a snapshot state
 *   tandem_project_create_from_template - Create a project from a template
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  TaskStatus,
  TaskEventType,
  ProjectStatus,
  ProjectType,
  ChildType,
  EnergyLevel,
  GoalStatus,
  HorizonLevel,
  Prisma,
} from "@prisma/client";
import { getPrisma, getUserId } from "./prisma-client";
import {
  computeChildInitialStatus,
  computeChildSortOrder,
} from "@/lib/sub-project-sequencing";
import { parseNaturalLanguageTask } from "@/lib/parsers/natural-language-task";
import {
  formatEventDescription,
  formatFieldChange,
  formatRelativeTime,
} from "@/lib/history/format";
import { diff as computeDiff } from "@/lib/history/diff";

// =============================================================================
// MCP Team Permission Helpers
// =============================================================================

async function mcpGetUserTeamIds(userId: string): Promise<string[]> {
  const prisma = getPrisma();
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

async function mcpIsTeamMember(
  userId: string,
  teamId: string
): Promise<boolean> {
  const prisma = getPrisma();
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  return !!member;
}

async function mcpRequireTeamMember(
  userId: string,
  teamId: string
): Promise<void> {
  const isMember = await mcpIsTeamMember(userId, teamId);
  if (!isMember) {
    throw new Error("You are not a member of this team");
  }
}

async function mcpRequireTeamAdmin(
  userId: string,
  teamId: string
): Promise<void> {
  const prisma = getPrisma();
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (member?.role !== "ADMIN") {
    throw new Error("Only team admins can perform this action");
  }
}

// =============================================================================
// Scope Filter Utilities
// =============================================================================

function buildTaskScopeFilter(
  scope: string | undefined,
  userId: string,
  teamIds: string[]
): Prisma.TaskWhereInput {
  if (scope === "personal") {
    return {
      userId,
      OR: [
        { project: null },
        { project: { teamId: null } },
      ],
    };
  }

  if (scope?.startsWith("team:")) {
    const teamId = scope.slice(5);
    if (!teamIds.includes(teamId)) {
      throw new Error("You are not a member of this team");
    }
    return { project: { teamId } };
  }

  // "all" (default): personal tasks + all team tasks
  if (teamIds.length === 0) {
    return { userId };
  }
  return {
    OR: [
      { userId },
      { project: { teamId: { in: teamIds } } },
    ],
  };
}

function buildProjectScopeFilter(
  scope: string | undefined,
  userId: string,
  teamIds: string[]
): Prisma.ProjectWhereInput {
  if (scope === "personal") {
    return { userId, teamId: null };
  }

  if (scope?.startsWith("team:")) {
    const teamId = scope.slice(5);
    if (!teamIds.includes(teamId)) {
      throw new Error("You are not a member of this team");
    }
    return { teamId };
  }

  // "all" (default): personal projects + all team projects
  if (teamIds.length === 0) {
    return { userId };
  }
  return {
    OR: [
      { userId },
      { teamId: { in: teamIds } },
    ],
  };
}

// =============================================================================
// Slugify Utility (inline copy — can't import app modules from MCP standalone)
// =============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS = [
  {
    name: "tandem_inbox_add",
    description:
      "Add a new item to the GTD inbox for later processing. Use this for quick capture of thoughts, ideas, or tasks that haven't been clarified yet.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "The content of the inbox item (what was captured)",
        },
        notes: {
          type: "string",
          description: "Optional additional notes or context",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "tandem_inbox_list",
    description:
      "List unprocessed inbox items. These are items that have been captured but not yet clarified into tasks, projects, or reference material.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of items to return (default: 50)",
        },
      },
    },
  },
  {
    name: "tandem_task_create",
    description:
      "Create a new task in the GTD system. Tasks can optionally be assigned to a project and context, with energy level and time estimates for the 'What Should I Do Now?' decision.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "The task title — should be a clear, actionable next action",
        },
        notes: {
          type: "string",
          description: "Additional notes or details for the task",
        },
        projectId: {
          type: "string",
          description: "ID of the project to assign this task to",
        },
        contextId: {
          type: "string",
          description:
            'ID of the context (e.g. @home, @office). Use tandem_project_list or the tandem://contexts resource to find IDs.',
        },
        energyLevel: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Energy level required for this task",
        },
        timeEstimate: {
          type: "number",
          description: "Estimated time in minutes",
        },
        scheduledDate: {
          type: "string",
          description:
            "ISO 8601 date string. HIDES the task from Do Now until this date (GTD tickler). Only use when the user explicitly wants to defer/snooze a task. Do NOT set this from dates mentioned in the task title — those are usually deadlines (use dueDate) or just informational context.",
        },
        dueDate: {
          type: "string",
          description:
            "ISO 8601 date string. Hard deadline or target date for the task. The task remains visible in Do Now but shows as due/overdue. Use this for target dates mentioned in task titles.",
        },
        assignedToId: {
          type: "string",
          description: "ID of a team member to assign this task to (team projects only)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "tandem_task_complete",
    description:
      "Mark a task as completed. This triggers the cascade engine: promoting the next task in sequential projects, checking for project completion, and updating goal progress.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to complete",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tandem_task_list",
    description:
      "List tasks with optional filters. Returns active tasks (not completed/dropped) by default. Use filters to narrow by context, project, or energy level. Use scope to filter by personal/team tasks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          description:
            'Filter scope: "personal" (only personal tasks), "team:{teamId}" (specific team), or "all" (default, personal + all teams)',
        },
        contextId: {
          type: "string",
          description: "Filter by context ID",
        },
        projectId: {
          type: "string",
          description: "Filter by project ID",
        },
        energyLevel: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Filter by energy level",
        },
        status: {
          type: "string",
          enum: ["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DROPPED"],
          description:
            "Filter by specific status. Defaults to showing NOT_STARTED and IN_PROGRESS.",
        },
        nextActionsOnly: {
          type: "boolean",
          description: "If true, only return next actions (default: false)",
        },
        limit: {
          type: "number",
          description: "Maximum number of tasks to return (default: 50)",
        },
      },
    },
  },
  {
    name: "tandem_what_now",
    description:
      'Get recommended next actions based on the GTD "What Should I Do Now?" criteria. Considers context, time available, energy level, and priority. Returns a prioritized list of tasks you could do right now.',
    inputSchema: {
      type: "object" as const,
      properties: {
        contextId: {
          type: "string",
          description: "Your current context ID (e.g. the @home or @office context)",
        },
        availableMinutes: {
          type: "number",
          description: "How many minutes you have available",
        },
        energyLevel: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Your current energy level",
        },
      },
    },
  },
  {
    name: "tandem_project_list",
    description:
      "List projects, optionally filtered by status. Shows project progress (completed tasks / total tasks). Use scope to filter by personal/team projects.",
    inputSchema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          description:
            'Filter scope: "personal" (only personal projects), "team:{teamId}" (specific team), or "all" (default, personal + all teams)',
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "ON_HOLD", "COMPLETED", "DROPPED", "SOMEDAY_MAYBE"],
          description: "Filter by project status (default: ACTIVE)",
        },
        limit: {
          type: "number",
          description: "Maximum number of projects to return (default: 50)",
        },
      },
    },
  },
  {
    name: "tandem_project_create",
    description:
      "Create a new project in the GTD system. A project is any desired outcome that requires more than one action step.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "The project title",
        },
        description: {
          type: "string",
          description: "Project description or notes",
        },
        type: {
          type: "string",
          enum: ["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"],
          description:
            "Project type. SEQUENTIAL: tasks done in order. PARALLEL: all tasks available at once. SINGLE_ACTIONS: container for unrelated one-off tasks. Default: SEQUENTIAL.",
        },
        outcome: {
          type: "string",
          description:
            "The desired outcome statement — what does 'done' look like?",
        },
        areaId: {
          type: "string",
          description: "ID of the area of focus this project belongs to",
        },
        isSomedayMaybe: {
          type: "boolean",
          description: "If true, this is a someday/maybe project (default: false)",
        },
        parentProjectId: {
          type: "string",
          description: "ID of an existing project to nest this under as a sub-project. Maximum depth is 3 levels.",
        },
        childType: {
          type: "string",
          enum: ["SEQUENTIAL", "PARALLEL"],
          description: "How sub-projects of this project are sequenced. SEQUENTIAL: one at a time. PARALLEL: all at once. Default: SEQUENTIAL.",
        },
        teamId: {
          type: "string",
          description: "ID of a team to create this project under. Requires team membership.",
        },
        tasks: {
          type: "array",
          description:
            "Tasks to create in the project. When aiSequence is true, AI will reorder these and add dependencies.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Task title" },
            },
            required: ["title"],
          },
        },
        aiSequence: {
          type: "boolean",
          description:
            "If true and tasks are provided, use AI to suggest optimal task order, project type, and dependencies. Default: false.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "tandem_search",
    description:
      "Search across tasks, projects, and inbox items. Uses case-insensitive text matching on titles, descriptions, and notes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query string",
        },
        scope: {
          type: "string",
          enum: ["all", "tasks", "projects", "inbox"],
          description:
            "Limit search to a specific type (default: all)",
        },
        includeCompleted: {
          type: "boolean",
          description: "Include completed/processed items in results (default: false)",
        },
        limit: {
          type: "number",
          description: "Maximum results per category (default: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "tandem_waiting_for_list",
    description:
      "List items you're waiting on from other people. Shows who you're waiting on, what for, and any due/follow-up dates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        includeResolved: {
          type: "boolean",
          description: "Include resolved waiting-for items (default: false)",
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return (default: 50)",
        },
      },
    },
  },
  {
    name: "tandem_review_status",
    description:
      "Get the status of the weekly review. Shows the latest review, its completion status, and key metrics to help determine if a review is due.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "tandem_horizon_note_list",
    description:
      "Read all horizon notes for the user (purpose, vision, goals overview, areas overview, etc.). Optionally filter by horizon level.",
    inputSchema: {
      type: "object" as const,
      properties: {
        level: {
          type: "string",
          enum: [
            "RUNWAY",
            "HORIZON_1",
            "HORIZON_2",
            "HORIZON_3",
            "HORIZON_4",
            "HORIZON_5",
          ],
          description: "Filter by horizon level",
        },
      },
    },
  },
  {
    name: "tandem_horizon_note_upsert",
    description:
      "Create or update a horizon note. Each horizon level (HORIZON_5 = purpose, HORIZON_4 = vision, etc.) can have one note per user. If a note already exists for that level, it will be updated.",
    inputSchema: {
      type: "object" as const,
      properties: {
        level: {
          type: "string",
          enum: [
            "RUNWAY",
            "HORIZON_1",
            "HORIZON_2",
            "HORIZON_3",
            "HORIZON_4",
            "HORIZON_5",
          ],
          description: "The horizon level for this note",
        },
        content: {
          type: "string",
          description: "The content of the horizon note",
        },
        title: {
          type: "string",
          description:
            "Optional title for the note. Defaults to the horizon level name if not provided.",
        },
      },
      required: ["level", "content"],
    },
  },
  {
    name: "tandem_goal_list",
    description:
      "List goals with optional status filter. Returns goals with title, description, status, progress, target date, linked area, and project count.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"],
          description:
            "Filter by goal status. If not provided, returns all non-deferred goals.",
        },
      },
    },
  },
  {
    name: "tandem_goal_create",
    description:
      "Create a new goal. Goals live at Horizon 3 (1-2 year goals) by default and can be linked to an area of responsibility.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "The goal title",
        },
        description: {
          type: "string",
          description: "Detailed description of the goal",
        },
        targetDate: {
          type: "string",
          description: "ISO 8601 date string for the goal target date",
        },
        status: {
          type: "string",
          enum: ["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"],
          description: "Goal status (default: NOT_STARTED)",
        },
        areaId: {
          type: "string",
          description: "ID of the area of responsibility this goal belongs to",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "tandem_goal_update",
    description:
      "Update an existing goal's title, description, status, progress, target date, or area.",
    inputSchema: {
      type: "object" as const,
      properties: {
        goalId: {
          type: "string",
          description: "The ID of the goal to update",
        },
        title: {
          type: "string",
          description: "New title for the goal",
        },
        description: {
          type: "string",
          description: "New description for the goal",
        },
        status: {
          type: "string",
          enum: ["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"],
          description: "New status for the goal",
        },
        progress: {
          type: "number",
          description: "Progress percentage (0-100)",
        },
        targetDate: {
          type: "string",
          description: "ISO 8601 date string for the goal target date",
        },
        areaId: {
          type: "string",
          description:
            "ID of the area of responsibility to link this goal to",
        },
      },
      required: ["goalId"],
    },
  },
  {
    name: "tandem_area_list",
    description:
      "List areas of responsibility. Shows each area with its name, description, active status, and counts of linked projects and goals.",
    inputSchema: {
      type: "object" as const,
      properties: {
        activeOnly: {
          type: "boolean",
          description:
            "If true (default), only return active areas. Set to false to include inactive areas.",
        },
      },
    },
  },
  {
    name: "tandem_area_create",
    description:
      "Create a new area of responsibility. Areas represent ongoing roles or standards you maintain (e.g. Health, Finance, Career).",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The area name",
        },
        description: {
          type: "string",
          description: "Description of this area of responsibility",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "tandem_horizon_review_status",
    description:
      "Check if a horizon review (initial setup, quarterly, or annual) is due. Returns whether horizon notes exist, last review date, days since review, and whether a review is overdue (>90 days).",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  // =========================================================================
  // Team Management Tools
  // =========================================================================
  {
    name: "tandem_team_list",
    description:
      "List user's teams with role, member count, and project count. No parameters needed.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "tandem_team_create",
    description:
      "Create a new team. The creator becomes an admin. Respects server settings for team creation permissions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The team name",
        },
        description: {
          type: "string",
          description: "Optional team description",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "tandem_team_members",
    description:
      "List members of a team. Requires team membership.",
    inputSchema: {
      type: "object" as const,
      properties: {
        teamId: {
          type: "string",
          description: "The team ID",
        },
      },
      required: ["teamId"],
    },
  },
  {
    name: "tandem_team_add_member",
    description:
      "Add a member to a team by email. Requires admin role.",
    inputSchema: {
      type: "object" as const,
      properties: {
        teamId: {
          type: "string",
          description: "The team ID",
        },
        userEmail: {
          type: "string",
          description: "Email of the user to add",
        },
        role: {
          type: "string",
          enum: ["MEMBER", "ADMIN"],
          description: "Role for the new member (default: MEMBER)",
        },
      },
      required: ["teamId", "userEmail"],
    },
  },
  {
    name: "tandem_team_remove_member",
    description:
      "Remove a member from a team. Requires admin role. Cannot remove the last admin.",
    inputSchema: {
      type: "object" as const,
      properties: {
        teamId: {
          type: "string",
          description: "The team ID",
        },
        userId: {
          type: "string",
          description: "ID of the user to remove",
        },
      },
      required: ["teamId", "userId"],
    },
  },
  {
    name: "tandem_task_assign",
    description:
      "Assign a task to a team member (by email), or unassign if no email provided. Task must be in a team project and both users must be team members.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description: "The task ID to assign",
        },
        assignToEmail: {
          type: "string",
          description: "Email of the team member to assign to. Omit to unassign.",
        },
      },
      required: ["taskId"],
    },
  },
  // =========================================================================
  // Task & Inbox CRUD Tools
  // =========================================================================
  {
    name: "tandem_task_update",
    description:
      "Update an existing task. Can change title, notes, status, energy level, time estimate, due date, scheduled date, context, or project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description: "ID of the task to update",
        },
        title: {
          type: "string",
          description: "New title",
        },
        notes: {
          type: "string",
          description: "New notes (markdown)",
        },
        status: {
          type: "string",
          enum: ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DROPPED"],
          description: "New status (use tandem_task_complete for completing tasks)",
        },
        energyLevel: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Energy level required. Set to empty string to clear.",
        },
        estimatedMins: {
          type: "number",
          description: "Estimated time in minutes. Set to 0 to clear.",
        },
        dueDate: {
          type: "string",
          description:
            "Hard deadline or target date (ISO 8601). Set to empty string to clear.",
        },
        scheduledDate: {
          type: "string",
          description:
            "Tickler/defer date (ISO 8601). HIDES the task from Do Now until this date. Only set when user explicitly wants to defer. Set to empty string to clear.",
        },
        contextId: {
          type: "string",
          description: "Context ID. Set to empty string to clear.",
        },
        projectId: {
          type: "string",
          description:
            "Project ID to move task to. Set to empty string to remove from project.",
        },
        isNextAction: {
          type: "boolean",
          description: "Whether this is a next action",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tandem_task_bulk_update",
    description:
      "Bulk update multiple tasks at once. Currently supports changing context for up to 100 tasks in a single call. Each task gets an individual history event.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of task IDs to update (1-100)",
        },
        updates: {
          type: "object",
          properties: {
            contextId: {
              type: "string",
              description:
                "Context ID to set. Use null or empty string to clear context.",
            },
          },
          description: "Updates to apply to all tasks",
        },
      },
      required: ["taskIds", "updates"],
    },
  },
  {
    name: "tandem_task_delete",
    description:
      "Delete a task by ID. Cannot be undone.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description: "ID of the task to delete",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tandem_inbox_update",
    description:
      "Update an inbox item's content or notes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        itemId: {
          type: "string",
          description: "ID of the inbox item",
        },
        content: {
          type: "string",
          description: "New content/title",
        },
        notes: {
          type: "string",
          description: "New notes",
        },
      },
      required: ["itemId"],
    },
  },
  {
    name: "tandem_inbox_delete",
    description:
      "Delete an inbox item by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        itemId: {
          type: "string",
          description: "ID of the inbox item to delete",
        },
      },
      required: ["itemId"],
    },
  },
  // =========================================================================
  // Wiki Tools
  // =========================================================================
  {
    name: "tandem_wiki_search",
    description:
      "Search wiki articles by title/content and/or tag. Searches personal articles and team articles the user has access to.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (matches title and content)",
        },
        tag: {
          type: "string",
          description: "Filter by tag",
        },
        teamId: {
          type: "string",
          description: "Optional: scope search to a specific team",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 20)",
        },
      },
    },
  },
  {
    name: "tandem_wiki_read",
    description:
      "Read a wiki article by slug. Falls back from personal to team articles if no teamId specified.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The article slug",
        },
        teamId: {
          type: "string",
          description: "Optional: scope to a specific team",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "tandem_wiki_create",
    description:
      "Create a new wiki article with title, content, optional tags and slug. Creates an initial version snapshot.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Article title",
        },
        content: {
          type: "string",
          description: "Article content (markdown supported)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for the article",
        },
        slug: {
          type: "string",
          description: "Optional custom slug (auto-generated from title if omitted)",
        },
        teamId: {
          type: "string",
          description: "Optional: create as a team article",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "tandem_wiki_update",
    description:
      "Update a wiki article by slug. Creates a version snapshot of the new state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The article slug to update",
        },
        title: {
          type: "string",
          description: "New title",
        },
        content: {
          type: "string",
          description: "New content",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags",
        },
        message: {
          type: "string",
          description: "Version message describing the change",
        },
        teamId: {
          type: "string",
          description: "Optional: scope to a specific team article",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "tandem_wiki_delete",
    description:
      "Delete a wiki article by slug. Team articles require admin role.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The article slug to delete",
        },
        teamId: {
          type: "string",
          description: "Optional: scope to a specific team article",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "tandem_wiki_history",
    description:
      "View version history of a wiki article by slug. Returns version numbers, timestamps, messages, and editors.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The article slug",
        },
        teamId: {
          type: "string",
          description: "Optional: scope to a specific team article",
        },
        limit: {
          type: "number",
          description: "Maximum versions to return (default: 20)",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "tandem_wiki_backlinks",
    description:
      "Find articles that link to a given slug via [[wikilink]] syntax. Scoped to same namespace (personal backlinks for personal articles, team backlinks for team articles).",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "The target article slug to find backlinks for",
        },
        teamId: {
          type: "string",
          description: "Optional: scope to a specific team's articles",
        },
        limit: {
          type: "number",
          description: "Maximum backlinks to return (default: 50)",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "tandem_task_create_from_text",
    description:
      "Create a task from natural language text. Automatically parses dates, @contexts, ~duration, !energy level, and #project from the input. Example: 'Call dentist Tuesday at 2pm @Phone ~15min !high'. If autoCreate is false, returns the parsed result without creating the task.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description:
            'Natural language task description. Supports: dates ("tomorrow", "next Tuesday"), @contexts (@Phone, @Computer), ~duration (~30min, ~1h), !energy (!high, !low), #project (#kitchen).',
        },
        autoCreate: {
          type: "boolean",
          description:
            "If true (default), create the task immediately. If false, return the parsed result without creating.",
        },
      },
      required: ["text"],
    },
  },
  // History tools
  {
    name: "tandem_task_history",
    description:
      "View the change history for a specific task. Shows timestamped events with actor, description, and field-level diffs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to view history for",
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return (default: 20)",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tandem_activity_feed",
    description:
      "Show recent activity across all tasks, projects, and inbox items. Returns a reverse-chronological feed of changes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default: 7)",
        },
        source: {
          type: "string",
          enum: ["all", "manual", "ai", "cascade"],
          description: 'Filter by event source (default: "all")',
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return (default: 30)",
        },
      },
    },
  },
  {
    name: "tandem_weekly_summary",
    description:
      "Aggregated summary of GTD activity for a given week. Shows task completions, creations, cascade events, active projects, and stale projects.",
    inputSchema: {
      type: "object" as const,
      properties: {
        weekOf: {
          type: "string",
          description:
            "ISO date string for the week to summarize (defaults to current week's Monday)",
        },
      },
    },
  },
  {
    name: "tandem_cascade_trace",
    description:
      "Trace the full cascade chain from a task completion. Shows what tasks were promoted, projects completed, and goals updated as a result.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description:
            "The ID of the completed task to trace cascades from",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tandem_task_revert",
    description:
      "Revert a task to a previous snapshot state. Creates a new event recording the revert.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to revert",
        },
        snapshotId: {
          type: "string",
          description: "The ID of the snapshot to revert to",
        },
        message: {
          type: "string",
          description:
            "Optional message describing why the revert was performed",
        },
      },
      required: ["taskId", "snapshotId"],
    },
  },
  {
    name: "tandem_project_create_from_template",
    description:
      "Create a project from a template. Lists available templates if no templateId given.",
    inputSchema: {
      type: "object" as const,
      properties: {
        templateId: {
          type: "string",
          description:
            "ID of the template to instantiate. Omit to list available templates.",
        },
        variables: {
          type: "object",
          description:
            'Variable values to fill in template placeholders (e.g., {"destination": "Japan"})',
          additionalProperties: { type: "string" },
        },
        projectTitle: {
          type: "string",
          description: "Override the project title (optional)",
        },
        areaId: {
          type: "string",
          description: "Area to assign the project to",
        },
        goalId: {
          type: "string",
          description: "Goal to link the project to",
        },
        teamId: {
          type: "string",
          description: "Team to create the project under",
        },
      },
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleInboxAdd(args: {
  title: string;
  notes?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const item = await prisma.inboxItem.create({
    data: {
      content: args.title,
      notes: args.notes ?? null,
      userId,
      aiVisibility: "VISIBLE",
    },
  });

  // Write the CAPTURED event
  await prisma.inboxEvent.create({
    data: {
      inboxItemId: item.id,
      eventType: "CAPTURED",
      actorType: "AI",
      actorId: userId,
      changes: {
        content: { old: null, new: item.content },
        ...(item.notes ? { notes: { old: null, new: item.notes } } : {}),
      },
      source: "MCP",
    },
  });

  return JSON.stringify(
    {
      success: true,
      item: {
        id: item.id,
        content: item.content,
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
      },
      message: `Added to inbox: "${item.content}"`,
    },
    null,
    2
  );
}

async function handleInboxList(args: {
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 50;

  const items = await prisma.inboxItem.findMany({
    where: { userId, status: "UNPROCESSED" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const total = await prisma.inboxItem.count({
    where: { userId, status: "UNPROCESSED" },
  });

  return JSON.stringify(
    {
      items: items.map((item) => ({
        id: item.id,
        content: item.content,
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      showing: items.length,
    },
    null,
    2
  );
}

async function handleTaskCreate(args: {
  title: string;
  notes?: string;
  projectId?: string;
  contextId?: string;
  energyLevel?: string;
  timeEstimate?: number;
  scheduledDate?: string;
  dueDate?: string;
  assignedToId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Determine isNextAction via cascade logic
  let isNextAction = true;
  if (args.projectId) {
    // Team-aware project lookup: user owns it OR it belongs to a team they're in
    const teamIds = await mcpGetUserTeamIds(userId);
    const project = await prisma.project.findFirst({
      where: {
        id: args.projectId,
        OR: [
          { userId },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
      select: { id: true, type: true, teamId: true },
    });
    if (!project) {
      return JSON.stringify({ success: false, error: "Project not found" });
    }

    // Validate assignee is a team member
    if (args.assignedToId && project.teamId) {
      const assigneeIsMember = await mcpIsTeamMember(args.assignedToId, project.teamId);
      if (!assigneeIsMember) {
        return JSON.stringify({ success: false, error: "Assignee is not a member of this team" });
      }
    }

    // For parallel/single-action projects, all tasks are next actions.
    // For sequential, only if no other next action exists.
    if (project.type === "SEQUENTIAL") {
      const existingNextAction = await prisma.task.findFirst({
        where: {
          projectId: project.id,
          isNextAction: true,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        },
      });
      isNextAction = !existingNextAction;
    }
    // PARALLEL and SINGLE_ACTIONS: isNextAction stays true
  }

  // Auto-calculate sortOrder for project tasks
  let sortOrder = 0;
  if (args.projectId) {
    const lastTask = await prisma.task.findFirst({
      where: { projectId: args.projectId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    sortOrder = lastTask ? lastTask.sortOrder + 1 : 0;
  }

  const task = await prisma.task.create({
    data: {
      title: args.title,
      notes: args.notes ?? null,
      userId,
      projectId: args.projectId ?? null,
      contextId: args.contextId ?? null,
      energyLevel: args.energyLevel
        ? (args.energyLevel as EnergyLevel)
        : null,
      estimatedMins: args.timeEstimate ?? null,
      scheduledDate: args.scheduledDate ? new Date(args.scheduledDate) : null,
      dueDate: args.dueDate ? new Date(args.dueDate) : null,
      isNextAction,
      sortOrder,
      assignedToId: args.assignedToId ?? null,
    },
    include: {
      project: { select: { id: true, title: true } },
      context: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  // Write CREATED event
  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      eventType: "CREATED",
      actorType: "AI",
      actorId: userId,
      changes: {
        title: { old: null, new: task.title },
        status: { old: null, new: task.status },
        isNextAction: { old: null, new: task.isNextAction },
        ...(task.projectId ? { projectId: { old: null, new: task.projectId } } : {}),
        ...(task.contextId ? { contextId: { old: null, new: task.contextId } } : {}),
        ...(task.energyLevel ? { energyLevel: { old: null, new: task.energyLevel } } : {}),
        ...(task.estimatedMins ? { estimatedMins: { old: null, new: task.estimatedMins } } : {}),
      },
      source: "MCP",
    },
  });

  return JSON.stringify(
    {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        isNextAction: task.isNextAction,
        project: task.project,
        context: task.context,
        assignedTo: task.assignedTo,
        energyLevel: task.energyLevel,
        estimatedMins: task.estimatedMins,
        scheduledDate: task.scheduledDate?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
      },
      message: `Created task: "${task.title}"${task.isNextAction ? " (next action)" : ""}`,
    },
    null,
    2
  );
}

async function handleTaskCreateFromText(args: {
  text: string;
  autoCreate?: boolean;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const autoCreate = args.autoCreate !== false;

  // Fetch user's contexts and active projects for matching
  const contexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const projects = await prisma.project.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, title: true },
  });

  const parsed = parseNaturalLanguageTask(args.text, { contexts, projects });

  if (!autoCreate) {
    return JSON.stringify({ success: true, parsed }, null, 2);
  }

  // Create the task by delegating to handleTaskCreate
  const createArgs: Parameters<typeof handleTaskCreate>[0] = {
    title: parsed.title,
    ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
    ...(parsed.scheduledDate ? { scheduledDate: parsed.scheduledDate } : {}),
    ...(parsed.contextId ? { contextId: parsed.contextId } : {}),
    ...(parsed.estimatedMins ? { timeEstimate: parsed.estimatedMins } : {}),
    ...(parsed.energyLevel ? { energyLevel: parsed.energyLevel } : {}),
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
  };

  const result = JSON.parse(await handleTaskCreate(createArgs));

  // Enrich the response with parsing details
  return JSON.stringify(
    {
      ...result,
      parsed: {
        originalText: args.text,
        extractedFields: Object.keys(parsed.confidence),
        confidence: parsed.confidence,
      },
    },
    null,
    2
  );
}

async function handleTaskComplete(args: {
  taskId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Verify task exists and user has access (owns it or is team member)
  const teamIds = await mcpGetUserTeamIds(userId);
  const existing = await prisma.task.findFirst({
    where: {
      id: args.taskId,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ project: { teamId: { in: teamIds } } }] : []),
      ],
    },
    include: { project: true },
  });
  if (!existing) {
    return JSON.stringify({ success: false, error: "Task not found" });
  }
  if (existing.status === "COMPLETED") {
    return JSON.stringify({
      success: false,
      error: "Task is already completed",
    });
  }

  // Mark task as completed (with version increment)
  const completedTask = await prisma.task.update({
    where: { id: args.taskId },
    data: {
      status: "COMPLETED",
      isNextAction: false,
      completedAt: new Date(),
      version: { increment: 1 },
    },
  });

  // Write COMPLETED event
  const completionEvent = await prisma.taskEvent.create({
    data: {
      taskId: args.taskId,
      eventType: "COMPLETED",
      actorType: "AI",
      actorId: userId,
      changes: {
        status: { old: existing.status, new: "COMPLETED" },
        isNextAction: { old: existing.isNextAction, new: false },
        completedAt: { old: null, new: completedTask.completedAt?.toISOString() },
      },
      source: "MCP",
    },
  });

  // --- CASCADE ENGINE ---
  const promotedTasks: Array<{ id: string; title: string }> = [];
  const completedProjects: Array<{ id: string; title: string }> = [];

  // 1. Find successor dependencies and promote unblocked tasks
  const successorDeps = await prisma.taskDependency.findMany({
    where: { predecessorId: args.taskId },
    include: {
      successor: {
        include: {
          predecessors: {
            include: {
              predecessor: { select: { id: true, status: true } },
            },
          },
          project: { select: { id: true, type: true, status: true } },
        },
      },
    },
  });

  for (const dep of successorDeps) {
    const successor = dep.successor;
    if (successor.status === "COMPLETED" || successor.status === "DROPPED") continue;

    // Only handle FS and FF on completion
    if (dep.type !== "FINISH_TO_START" && dep.type !== "FINISH_TO_FINISH") continue;

    // Check all FS predecessors are complete
    const fsPreds = successor.predecessors.filter(
      (p) => p.type === "FINISH_TO_START"
    );
    const allFsComplete = fsPreds.every(
      (p) => p.predecessor.status === "COMPLETED" || p.predecessorId === args.taskId
    );
    if (!allFsComplete) continue;

    if (successor.project?.status !== "ACTIVE") continue;

    // Handle lag time
    if (dep.lagMinutes > 0 && completedTask.completedAt) {
      const scheduledDate = new Date(
        completedTask.completedAt.getTime() + dep.lagMinutes * 60000
      );
      await prisma.task.update({
        where: { id: successor.id },
        data: { scheduledDate, version: { increment: 1 } },
      });
    }

    // Milestone auto-completion
    if (successor.isMilestone) {
      const allPredsComplete = successor.predecessors.every(
        (p) => p.predecessor.status === "COMPLETED" || p.predecessorId === args.taskId
      );
      if (allPredsComplete) {
        await prisma.task.update({
          where: { id: successor.id },
          data: { status: "COMPLETED", isNextAction: false, completedAt: new Date(), version: { increment: 1 } },
        });
        continue;
      }
    }

    if (successor.project?.type === "SEQUENTIAL") {
      const existingNext = await prisma.task.findFirst({
        where: {
          projectId: successor.project.id,
          isNextAction: true,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          id: { not: args.taskId },
        },
      });
      if (existingNext) continue;
    }

    await prisma.task.update({
      where: { id: successor.id },
      data: { isNextAction: true, version: { increment: 1 } },
    });
    promotedTasks.push({ id: successor.id, title: successor.title });
  }

  // 2. For sequential projects, promote the next task in sort order
  if (existing.project?.type === "SEQUENTIAL" && existing.projectId) {
    const nextTask = await prisma.task.findFirst({
      where: {
        projectId: existing.projectId,
        userId,
        status: "NOT_STARTED",
        isNextAction: false,
        predecessors: {
          every: {
            OR: [
              { predecessor: { status: "COMPLETED" } },
              { type: { not: "FINISH_TO_START" } },
            ],
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    if (nextTask) {
      const existingNext = await prisma.task.findFirst({
        where: {
          projectId: existing.projectId,
          isNextAction: true,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        },
      });

      if (!existingNext && !promotedTasks.some((t) => t.id === nextTask.id)) {
        await prisma.task.update({
          where: { id: nextTask.id },
          data: { isNextAction: true, version: { increment: 1 } },
        });
        promotedTasks.push({ id: nextTask.id, title: nextTask.title });
      }
    }
  }

  // 3. Check if project is now complete
  if (existing.projectId) {
    const remainingTasks = await prisma.task.count({
      where: {
        projectId: existing.projectId,
        userId,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });

    if (remainingTasks === 0) {
      const project = await prisma.project.update({
        where: { id: existing.projectId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      completedProjects.push({ id: project.id, title: project.title });

      // Write project COMPLETED event
      await prisma.projectEvent.create({
        data: {
          projectId: project.id,
          eventType: "COMPLETED",
          actorType: "SYSTEM",
          actorId: userId,
          changes: {
            status: { old: "ACTIVE", new: "COMPLETED" },
          },
          source: "CASCADE",
          triggeredBy: completionEvent.id,
        },
      });
    }
  }

  // Write PROMOTED events for cascaded tasks
  for (const promoted of promotedTasks) {
    await prisma.taskEvent.create({
      data: {
        taskId: promoted.id,
        eventType: "PROMOTED",
        actorType: "SYSTEM",
        actorId: userId,
        changes: {
          isNextAction: { old: false, new: true },
        },
        source: "CASCADE",
        triggeredBy: completionEvent.id,
        message: `Promoted after completion of task ${args.taskId}`,
      },
    });
  }

  // Recycle recurring task if linked to a template
  const recycledTasks: Array<{ id: string; title: string; nextDue: string }> = [];
  if (existing.recurringTemplateId) {
    const { recycleRecurringTask } = await import("@/lib/recurring");
    const recycled = await recycleRecurringTask(existing.recurringTemplateId);
    if (recycled) {
      recycledTasks.push({
        id: recycled.id,
        title: recycled.title,
        nextDue: recycled.nextDue.toISOString(),
      });
    }
  }

  // Build response
  const parts: string[] = [`Completed: "${existing.title}"`];
  if (promotedTasks.length > 0) {
    parts.push(
      `Promoted next action${promotedTasks.length > 1 ? "s" : ""}: ${promotedTasks
        .map((t) => `"${t.title}"`)
        .join(", ")}`
    );
  }
  if (completedProjects.length > 0) {
    parts.push(
      `Project${completedProjects.length > 1 ? "s" : ""} completed: ${completedProjects
        .map((p) => `"${p.title}"`)
        .join(", ")}`
    );
  }
  if (recycledTasks.length > 0) {
    parts.push(
      `Recycled: scheduled "${recycledTasks[0].title}" for ${recycledTasks[0].nextDue}`
    );
  }

  return JSON.stringify(
    {
      success: true,
      completedTask: {
        id: existing.id,
        title: existing.title,
      },
      cascade: {
        promotedTasks,
        completedProjects,
        recycledTasks,
      },
      message: parts.join(". ") + ".",
    },
    null,
    2
  );
}

async function handleTaskList(args: {
  scope?: string;
  contextId?: string;
  projectId?: string;
  energyLevel?: string;
  status?: string;
  nextActionsOnly?: boolean;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 50;

  const teamIds = await mcpGetUserTeamIds(userId);
  const scopeFilter = buildTaskScopeFilter(args.scope, userId, teamIds);

  const where: Prisma.TaskWhereInput = {
    ...scopeFilter,
  };

  // Status filter
  if (args.status) {
    where.status = args.status as TaskStatus;
  } else {
    where.status = { in: ["NOT_STARTED", "IN_PROGRESS"] };
  }

  if (args.contextId) where.contextId = args.contextId;
  if (args.projectId) where.projectId = args.projectId;
  if (args.energyLevel) where.energyLevel = args.energyLevel as EnergyLevel;
  if (args.nextActionsOnly) where.isNextAction = true;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ isNextAction: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: limit,
    include: {
      project: { select: { id: true, title: true, teamId: true, team: { select: { id: true, name: true } } } },
      context: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  const total = await prisma.task.count({ where });

  return JSON.stringify(
    {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        isNextAction: t.isNextAction,
        energyLevel: t.energyLevel,
        estimatedMins: t.estimatedMins,
        scheduledDate: t.scheduledDate?.toISOString() ?? null,
        dueDate: t.dueDate?.toISOString() ?? null,
        project: t.project,
        context: t.context,
        assignedTo: t.assignedTo,
        version: t.version,
      })),
      total,
      showing: tasks.length,
    },
    null,
    2
  );
}

async function handleWhatNow(args: {
  contextId?: string;
  availableMinutes?: number;
  energyLevel?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Build filter for available next actions (personal + team tasks)
  const teamIds = await mcpGetUserTeamIds(userId);

  // Ownership filter: personal tasks OR assigned-to-me team tasks OR unassigned team tasks
  const ownershipFilter: Prisma.TaskWhereInput =
    teamIds.length > 0
      ? {
          OR: [
            // Personal tasks (no team project or no project)
            { userId, OR: [{ project: null }, { project: { teamId: null } }] },
            // Team tasks assigned to me
            { project: { teamId: { in: teamIds } }, assignedToId: userId },
            // Unassigned team tasks
            { project: { teamId: { in: teamIds } }, assignedToId: null },
          ],
        }
      : { userId };

  const where: Prisma.TaskWhereInput = {
    ...ownershipFilter,
    isNextAction: true,
    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    // Exclude deferred tasks (scheduled for the future)
    OR: [
      { scheduledDate: null },
      { scheduledDate: { lte: new Date() } },
    ],
  };

  // Apply context filter
  if (args.contextId) {
    where.contextId = args.contextId;
  }

  // Apply time filter
  if (args.availableMinutes) {
    where.OR = [
      { estimatedMins: null },
      { estimatedMins: { lte: args.availableMinutes } },
      ...(where.OR ? (where.OR as Prisma.TaskWhereInput[]) : []),
    ];
    // Rebuild OR to combine scheduledDate and estimatedMins filters
    where.AND = [
      {
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: new Date() } },
        ],
      },
      {
        OR: [
          { estimatedMins: null },
          { estimatedMins: { lte: args.availableMinutes } },
        ],
      },
    ];
    delete where.OR;
  }

  // Apply energy filter — show tasks at or below the specified energy level
  if (args.energyLevel) {
    const energyHierarchy: Record<string, EnergyLevel[]> = {
      LOW: ["LOW"],
      MEDIUM: ["LOW", "MEDIUM"],
      HIGH: ["LOW", "MEDIUM", "HIGH"],
    };
    const allowedLevels = energyHierarchy[args.energyLevel] ?? ["LOW", "MEDIUM", "HIGH"];
    where.OR = [
      { energyLevel: null },
      { energyLevel: { in: allowedLevels } },
    ];
    // If we already have AND from time filter, add energy there
    if (where.AND) {
      (where.AND as Prisma.TaskWhereInput[]).push({
        OR: [
          { energyLevel: null },
          { energyLevel: { in: allowedLevels } },
        ],
      });
      delete where.OR;
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { dueDate: "asc" },      // Urgent items first
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 15,
    include: {
      project: { select: { id: true, title: true, team: { select: { id: true, name: true } } } },
      context: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  // Separate tasks with due dates (urgent) from others
  const now = new Date();
  const urgent = tasks.filter(
    (t) => t.dueDate && t.dueDate <= new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  );
  const regular = tasks.filter(
    (t) => !t.dueDate || t.dueDate > new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  );

  const formatTask = (t: (typeof tasks)[0]) => ({
    id: t.id,
    title: t.title,
    energyLevel: t.energyLevel,
    estimatedMins: t.estimatedMins,
    dueDate: t.dueDate?.toISOString() ?? null,
    project: t.project,
    context: t.context,
    assignedTo: t.assignedTo,
  });

  const filterSummary: string[] = [];
  if (args.contextId) {
    const ctx = tasks[0]?.context;
    filterSummary.push(`context: ${ctx?.name ?? args.contextId}`);
  }
  if (args.availableMinutes) {
    filterSummary.push(`${args.availableMinutes} minutes available`);
  }
  if (args.energyLevel) {
    filterSummary.push(`energy: ${args.energyLevel.toLowerCase()}`);
  }

  return JSON.stringify(
    {
      recommendations: {
        urgent: urgent.map(formatTask),
        available: regular.map(formatTask),
      },
      filters: filterSummary.length > 0 ? filterSummary.join(", ") : "none",
      totalAvailable: tasks.length,
      message:
        tasks.length === 0
          ? "No next actions match your current criteria. Try broadening your filters or checking if tasks need to be clarified from the inbox."
          : `Found ${tasks.length} available next action${tasks.length === 1 ? "" : "s"}${
              urgent.length > 0 ? ` (${urgent.length} urgent)` : ""
            }.`,
    },
    null,
    2
  );
}

async function handleProjectList(args: {
  scope?: string;
  status?: string;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 50;

  const status = (args.status as ProjectStatus) ?? "ACTIVE";
  const teamIds = await mcpGetUserTeamIds(userId);
  const scopeFilter = buildProjectScopeFilter(args.scope, userId, teamIds);

  const whereClause = { ...scopeFilter, status };

  const projects = await prisma.project.findMany({
    where: whereClause,
    orderBy: { sortOrder: "asc" },
    take: limit,
    include: {
      area: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      _count: {
        select: {
          tasks: true,
        },
      },
      tasks: {
        where: { status: "COMPLETED" },
        select: { id: true },
      },
    },
  });

  // Also get next action counts per project
  const projectIds = projects.map((p) => p.id);
  const nextActionCounts = await prisma.task.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
      isNextAction: true,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    },
    _count: { id: true },
  });
  const nextActionMap = new Map(
    nextActionCounts.map((r) => [r.projectId, r._count.id])
  );

  const total = await prisma.project.count({ where: whereClause });

  return JSON.stringify(
    {
      projects: projects.map((p) => {
        const totalTasks = p._count.tasks;
        const completedTasks = p.tasks.length;
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          type: p.type,
          area: p.area,
          team: p.team,
          totalTasks,
          completedTasks,
          progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          nextActions: nextActionMap.get(p.id) ?? 0,
          outcome: p.outcome,
        };
      }),
      total,
      showing: projects.length,
    },
    null,
    2
  );
}

async function handleProjectCreate(args: {
  title: string;
  description?: string;
  type?: string;
  childType?: string;
  outcome?: string;
  areaId?: string;
  isSomedayMaybe?: boolean;
  parentProjectId?: string;
  teamId?: string;
  tasks?: Array<{ title: string }>;
  aiSequence?: boolean;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // AI scaffold branch: if aiSequence requested and enough tasks provided
  if (args.aiSequence && args.tasks && args.tasks.length >= 2) {
    const { resolveAIConfig } = await import("@/lib/ai/resolve-key");
    const { getScaffoldSuggestion } = await import("@/lib/ai/scaffold-ai");
    const { applyProjectScaffold } = await import("@/lib/services/scaffold-service");

    const config = await resolveAIConfig(userId);
    if (!config) throw new Error("AI not available");

    const contexts = await prisma.context.findMany({
      where: { userId },
      select: { name: true },
    });

    const suggestion = await getScaffoldSuggestion(config, {
      projectTitle: args.title,
      projectDescription: args.description,
      tasks: args.tasks,
      contexts,
    });

    const project = await applyProjectScaffold({
      userId,
      projectTitle: args.title,
      projectDescription: args.description,
      suggestion,
      areaId: args.areaId,
      teamId: args.teamId,
      parentProjectId: args.parentProjectId,
      actor: { actorType: "AI", actorId: userId, source: "MCP" },
    });

    const taskList = [...suggestion.tasks]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t, i) => {
        const deps = t.dependsOn?.length
          ? ` (after: ${t.dependsOn.map((d) => {
              const depTask = suggestion.tasks.find((st) => st.sortOrder === d);
              return depTask ? depTask.title : `#${d + 1}`;
            }).join(", ")})`
          : "";
        return `${i + 1}. ${t.title}${deps}`;
      })
      .join("\n");

    return JSON.stringify(
      {
        success: true,
        project: {
          id: project.id,
          title: project.title,
          type: suggestion.projectType,
        },
        suggestion,
        message:
          `Created project "${project.title}" (${suggestion.projectType.toLowerCase()})\n` +
          `AI reasoning: ${suggestion.projectTypeReason}\n\n` +
          `Tasks (AI-ordered):\n${taskList}`,
      },
      null,
      2
    );
  }

  // Non-AI tasks branch: create project then create each task in order
  if (args.tasks && args.tasks.length > 0 && !args.aiSequence) {
    const projectType = (args.type as ProjectType) ?? "SEQUENTIAL";
    const isSomedayMaybe = args.isSomedayMaybe ?? false;

    // Compute parent hierarchy fields if parentProjectId is specified
    let tasksParentProjectId: string | null = null;
    let tasksDepth = 0;
    let tasksPath = "";
    let tasksInheritedAreaId = args.areaId ?? null;
    let tasksResolvedTeamId = args.teamId ?? null;
    let tasksStatus: ProjectStatus = isSomedayMaybe ? "SOMEDAY_MAYBE" : "ACTIVE";
    let tasksSortOrder = 0;

    if (args.parentProjectId) {
      const teamIds = await mcpGetUserTeamIds(userId);
      const parent = await prisma.project.findFirst({
        where: {
          id: args.parentProjectId,
          OR: [
            { userId },
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
          ],
        },
        select: { id: true, depth: true, path: true, areaId: true, teamId: true, childType: true },
      });
      if (!parent) {
        throw new Error("Parent project not found");
      }
      if (parent.depth >= 2) {
        throw new Error("Maximum sub-project depth (3 levels) would be exceeded");
      }
      tasksParentProjectId = parent.id;
      tasksDepth = parent.depth + 1;
      tasksPath = parent.path + parent.id + "/";
      if (!args.areaId && parent.areaId) {
        tasksInheritedAreaId = parent.areaId;
      }
      if (parent.teamId) {
        tasksResolvedTeamId = parent.teamId;
      }
      if (!isSomedayMaybe) {
        tasksStatus = await computeChildInitialStatus(parent.id, parent.childType);
        tasksSortOrder = await computeChildSortOrder(parent.id);
      }
    }

    if (tasksResolvedTeamId) {
      await mcpRequireTeamMember(userId, tasksResolvedTeamId);
    }

    const project = await prisma.project.create({
      data: {
        title: args.title,
        description: args.description ?? null,
        type: projectType,
        childType: (args.childType as ChildType) ?? undefined,
        outcome: args.outcome ?? null,
        areaId: tasksInheritedAreaId,
        userId,
        isSomedayMaybe,
        status: tasksStatus,
        parentProjectId: tasksParentProjectId,
        depth: tasksDepth,
        path: tasksPath,
        sortOrder: tasksSortOrder,
        teamId: tasksResolvedTeamId,
      },
    });

    // Write CREATED event
    await prisma.projectEvent.create({
      data: {
        projectId: project.id,
        eventType: "CREATED",
        actorType: "AI",
        actorId: userId,
        changes: {
          title: { old: null, new: project.title },
          status: { old: null, new: project.status },
          type: { old: null, new: project.type },
        },
        source: "MCP",
      },
    });

    // Create tasks in order
    const createdTasks = [];
    for (let i = 0; i < args.tasks.length; i++) {
      const isNextAction =
        projectType === "SEQUENTIAL" ? i === 0 : true;

      const task = await prisma.task.create({
        data: {
          title: args.tasks[i].title,
          userId,
          projectId: project.id,
          sortOrder: i,
          isNextAction,
        },
      });

      await prisma.taskEvent.create({
        data: {
          taskId: task.id,
          eventType: "CREATED",
          actorType: "AI",
          actorId: userId,
          changes: {
            title: { old: null, new: task.title },
            status: { old: null, new: task.status },
            isNextAction: { old: null, new: task.isNextAction },
            projectId: { old: null, new: project.id },
          },
          source: "MCP",
        },
      });

      createdTasks.push({ id: task.id, title: task.title, sortOrder: i });
    }

    return JSON.stringify(
      {
        success: true,
        project: {
          id: project.id,
          title: project.title,
          type: project.type,
        },
        tasks: createdTasks,
        message: `Created project "${project.title}" with ${createdTasks.length} tasks`,
      },
      null,
      2
    );
  }

  const projectType = (args.type as ProjectType) ?? "SEQUENTIAL";
  const isSomedayMaybe = args.isSomedayMaybe ?? false;

  // If parentProjectId is specified, validate the parent and compute hierarchy fields
  let parentProjectId: string | null = null;
  let depth = 0;
  let path = "";
  let inheritedAreaId = args.areaId ?? null;
  let resolvedTeamId = args.teamId ?? null;
  let computedStatus: ProjectStatus = isSomedayMaybe ? "SOMEDAY_MAYBE" : "ACTIVE";
  let computedSortOrder = 0;

  if (args.parentProjectId) {
    // Team-aware parent lookup
    const teamIds = await mcpGetUserTeamIds(userId);
    const parent = await prisma.project.findFirst({
      where: {
        id: args.parentProjectId,
        OR: [
          { userId },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
      select: { id: true, depth: true, path: true, areaId: true, teamId: true, childType: true },
    });
    if (!parent) {
      throw new Error("Parent project not found");
    }
    if (parent.depth >= 2) {
      throw new Error("Maximum sub-project depth (3 levels) would be exceeded");
    }
    parentProjectId = parent.id;
    depth = parent.depth + 1;
    path = parent.path + parent.id + "/";
    // Inherit area from parent if not explicitly set
    if (!args.areaId && parent.areaId) {
      inheritedAreaId = parent.areaId;
    }
    // Inherit teamId from parent for sub-projects
    if (parent.teamId) {
      resolvedTeamId = parent.teamId;
    }
    // Compute sequencing-aware status and sort order
    if (!isSomedayMaybe) {
      computedStatus = await computeChildInitialStatus(parent.id, parent.childType);
      computedSortOrder = await computeChildSortOrder(parent.id);
    }
  }

  // Validate team membership if teamId is set
  if (resolvedTeamId) {
    await mcpRequireTeamMember(userId, resolvedTeamId);
  }

  const project = await prisma.project.create({
    data: {
      title: args.title,
      description: args.description ?? null,
      type: projectType,
      childType: (args.childType as ChildType) ?? undefined,
      outcome: args.outcome ?? null,
      areaId: inheritedAreaId,
      userId,
      isSomedayMaybe,
      status: computedStatus,
      parentProjectId,
      depth,
      path,
      sortOrder: computedSortOrder,
      teamId: resolvedTeamId,
    },
    include: {
      area: { select: { id: true, name: true } },
      parentProject: { select: { id: true, title: true } },
      team: { select: { id: true, name: true } },
    },
  });

  // Write CREATED event
  await prisma.projectEvent.create({
    data: {
      projectId: project.id,
      eventType: "CREATED",
      actorType: "AI",
      actorId: userId,
      changes: {
        title: { old: null, new: project.title },
        status: { old: null, new: project.status },
        type: { old: null, new: project.type },
        ...(project.outcome ? { outcome: { old: null, new: project.outcome } } : {}),
        ...(project.description
          ? { description: { old: null, new: project.description } }
          : {}),
        ...(parentProjectId ? { parentProjectId: { old: null, new: parentProjectId } } : {}),
      },
      source: "MCP",
    },
  });

  return JSON.stringify(
    {
      success: true,
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        type: project.type,
        outcome: project.outcome,
        area: project.area,
        team: project.team,
        parentProject: project.parentProject,
      },
      message: parentProjectId
        ? `Created sub-project: "${project.title}" under "${project.parentProject?.title}"`
        : `Created project: "${project.title}" (${project.type.toLowerCase()})`,
    },
    null,
    2
  );
}

async function handleSearch(args: {
  query: string;
  scope?: string;
  includeCompleted?: boolean;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 20;
  const scope = args.scope ?? "all";
  const includeCompleted = args.includeCompleted ?? false;

  const teamIds = await mcpGetUserTeamIds(userId);

  const results: {
    tasks?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
    inboxItems?: Array<Record<string, unknown>>;
  } = {};

  // Search tasks
  if (scope === "all" || scope === "tasks") {
    const taskOwnerFilter: Prisma.TaskWhereInput =
      teamIds.length > 0
        ? { OR: [{ userId }, { project: { teamId: { in: teamIds } } }] }
        : { userId };

    const taskWhere: Prisma.TaskWhereInput = {
      ...taskOwnerFilter,
      AND: [
        {
          OR: [
            { title: { contains: args.query, mode: "insensitive" } },
            { notes: { contains: args.query, mode: "insensitive" } },
          ],
        },
      ],
    };
    if (!includeCompleted) {
      taskWhere.status = { notIn: ["COMPLETED", "DROPPED"] };
    }

    const tasks = await prisma.task.findMany({
      where: taskWhere,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, title: true, team: { select: { id: true, name: true } } } },
        context: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    results.tasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      isNextAction: t.isNextAction,
      project: t.project,
      context: t.context,
      assignedTo: t.assignedTo,
    }));
  }

  // Search projects
  if (scope === "all" || scope === "projects") {
    const projectOwnerFilter: Prisma.ProjectWhereInput =
      teamIds.length > 0
        ? { OR: [{ userId }, { teamId: { in: teamIds } }] }
        : { userId };

    const projectWhere: Prisma.ProjectWhereInput = {
      ...projectOwnerFilter,
      AND: [
        {
          OR: [
            { title: { contains: args.query, mode: "insensitive" } },
            { description: { contains: args.query, mode: "insensitive" } },
            { outcome: { contains: args.query, mode: "insensitive" } },
          ],
        },
      ],
    };
    if (!includeCompleted) {
      projectWhere.status = { notIn: ["COMPLETED", "DROPPED"] };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        area: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    results.projects = projects.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      type: p.type,
      area: p.area,
      team: p.team,
      outcome: p.outcome,
    }));
  }

  // Search inbox items
  if (scope === "all" || scope === "inbox") {
    const inboxWhere: Prisma.InboxItemWhereInput = {
      userId,
      OR: [
        { content: { contains: args.query, mode: "insensitive" } },
        { notes: { contains: args.query, mode: "insensitive" } },
      ],
    };
    if (!includeCompleted) {
      inboxWhere.status = "UNPROCESSED";
    }

    const items = await prisma.inboxItem.findMany({
      where: inboxWhere,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    results.inboxItems = items.map((item) => ({
      id: item.id,
      content: item.content,
      notes: item.notes,
      status: item.status,
    }));
  }

  const totalResults =
    (results.tasks?.length ?? 0) +
    (results.projects?.length ?? 0) +
    (results.inboxItems?.length ?? 0);

  return JSON.stringify(
    {
      query: args.query,
      results,
      totalResults,
      message:
        totalResults === 0
          ? `No results found for "${args.query}".`
          : `Found ${totalResults} result${totalResults === 1 ? "" : "s"} for "${args.query}".`,
    },
    null,
    2
  );
}

async function handleWaitingForList(args: {
  includeResolved?: boolean;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 50;
  const includeResolved = args.includeResolved ?? false;

  const where: Prisma.WaitingForWhereInput = { userId };
  if (!includeResolved) {
    where.isResolved = false;
  }

  const items = await prisma.waitingFor.findMany({
    where,
    orderBy: [{ followUpDate: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: limit,
  });

  const total = await prisma.waitingFor.count({ where });

  // Flag overdue items
  const now = new Date();

  return JSON.stringify(
    {
      items: items.map((item) => ({
        id: item.id,
        description: item.description,
        person: item.person,
        dueDate: item.dueDate?.toISOString() ?? null,
        followUpDate: item.followUpDate?.toISOString() ?? null,
        isResolved: item.isResolved,
        isOverdue: item.dueDate ? item.dueDate < now && !item.isResolved : false,
        needsFollowUp: item.followUpDate
          ? item.followUpDate <= now && !item.isResolved
          : false,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      showing: items.length,
    },
    null,
    2
  );
}

async function handleReviewStatus(): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Get latest review
  const latestReview = await prisma.weeklyReview.findFirst({
    where: { userId },
    orderBy: { weekOf: "desc" },
  });

  // Calculate key metrics for review readiness
  const now = new Date();
  const daysSinceLastReview = latestReview?.completedAt
    ? Math.floor(
        (now.getTime() - latestReview.completedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const [
    inboxCount,
    staleTasks,
    activeProjects,
    unresolvedWaiting,
  ] = await Promise.all([
    // Unprocessed inbox items
    prisma.inboxItem.count({
      where: { userId, status: "UNPROCESSED" },
    }),
    // Tasks not updated in 14+ days that are still active
    prisma.task.count({
      where: {
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        updatedAt: {
          lt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    // Active projects without next actions
    prisma.project.findMany({
      where: {
        userId,
        status: "ACTIVE",
        tasks: {
          none: {
            isNextAction: true,
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          },
        },
      },
      select: { id: true, title: true },
    }),
    // Unresolved waiting-for items
    prisma.waitingFor.count({
      where: { userId, isResolved: false },
    }),
  ]);

  const isReviewOverdue = daysSinceLastReview === null || daysSinceLastReview >= 7;

  return JSON.stringify(
    {
      latestReview: latestReview
        ? {
            id: latestReview.id,
            status: latestReview.status,
            weekOf: latestReview.weekOf.toISOString(),
            completedAt: latestReview.completedAt?.toISOString() ?? null,
            checklist: latestReview.checklist,
            notes: latestReview.notes,
          }
        : null,
      daysSinceLastReview,
      isReviewOverdue,
      metrics: {
        inboxItemsToProcess: inboxCount,
        staleTasksCount: staleTasks,
        projectsWithoutNextActions: activeProjects.map((p) => ({
          id: p.id,
          title: p.title,
        })),
        unresolvedWaitingFor: unresolvedWaiting,
      },
      message: isReviewOverdue
        ? `Weekly review is overdue${
            daysSinceLastReview !== null
              ? ` (${daysSinceLastReview} days since last review)`
              : " (no reviews on record)"
          }. ${inboxCount} inbox items to process, ${staleTasks} stale tasks, ${activeProjects.length} projects without next actions.`
        : `Last review completed ${daysSinceLastReview} day${
            daysSinceLastReview === 1 ? "" : "s"
          } ago. System health: ${inboxCount} inbox items, ${staleTasks} stale tasks, ${activeProjects.length} projects without next actions.`,
    },
    null,
    2
  );
}

// =============================================================================
// Horizon Tool Handlers
// =============================================================================

const HORIZON_LEVEL_TITLES: Record<string, string> = {
  HORIZON_5: "Life Purpose & Principles",
  HORIZON_4: "Long-term Vision",
  HORIZON_3: "1-2 Year Goals",
  HORIZON_2: "Areas of Focus",
  HORIZON_1: "Current Projects",
  RUNWAY: "Current Actions",
};

async function handleHorizonNoteList(args: {
  level?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const where: Prisma.HorizonNoteWhereInput = { userId };
  if (args.level) {
    where.level = args.level as HorizonLevel;
  }

  const notes = await prisma.horizonNote.findMany({
    where,
    orderBy: { level: "desc" },
  });

  return JSON.stringify(
    {
      notes: notes.map((n) => ({
        id: n.id,
        level: n.level,
        title: n.title,
        content: n.content,
        updatedAt: n.updatedAt.toISOString(),
      })),
      total: notes.length,
    },
    null,
    2
  );
}

async function handleHorizonNoteUpsert(args: {
  level: string;
  content: string;
  title?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const level = args.level as HorizonLevel;
  const title = args.title ?? HORIZON_LEVEL_TITLES[args.level] ?? args.level;

  // Find existing note for this user + level
  const existing = await prisma.horizonNote.findFirst({
    where: { userId, level },
  });

  let note;
  if (existing) {
    note = await prisma.horizonNote.update({
      where: { id: existing.id },
      data: { content: args.content, title },
    });
  } else {
    note = await prisma.horizonNote.create({
      data: { level, title, content: args.content, userId },
    });
  }

  return JSON.stringify(
    {
      success: true,
      note: {
        id: note.id,
        level: note.level,
        title: note.title,
        content: note.content,
        updatedAt: note.updatedAt.toISOString(),
      },
      message: existing
        ? `Updated ${level} note: "${title}"`
        : `Created ${level} note: "${title}"`,
    },
    null,
    2
  );
}

async function handleGoalList(args: {
  status?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const where: Prisma.GoalWhereInput = { userId };
  if (args.status) {
    where.status = args.status as GoalStatus;
  }

  const goals = await prisma.goal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      area: { select: { id: true, name: true } },
      _count: { select: { projects: true } },
    },
  });

  return JSON.stringify(
    {
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        status: g.status,
        horizon: g.horizon,
        progress: g.progress,
        targetDate: g.targetDate?.toISOString() ?? null,
        area: g.area,
        projectCount: g._count.projects,
        updatedAt: g.updatedAt.toISOString(),
      })),
      total: goals.length,
    },
    null,
    2
  );
}

async function handleGoalCreate(args: {
  title: string;
  description?: string;
  targetDate?: string;
  status?: string;
  areaId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const goal = await prisma.goal.create({
    data: {
      title: args.title,
      description: args.description ?? null,
      targetDate: args.targetDate ? new Date(args.targetDate) : null,
      status: (args.status as GoalStatus) ?? "NOT_STARTED",
      horizon: "HORIZON_3",
      progress: 0,
      userId,
      areaId: args.areaId ?? null,
    },
    include: {
      area: { select: { id: true, name: true } },
    },
  });

  return JSON.stringify(
    {
      success: true,
      goal: {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        status: goal.status,
        horizon: goal.horizon,
        progress: goal.progress,
        targetDate: goal.targetDate?.toISOString() ?? null,
        area: goal.area,
      },
      message: `Created goal: "${goal.title}"`,
    },
    null,
    2
  );
}

async function handleGoalUpdate(args: {
  goalId: string;
  title?: string;
  description?: string;
  status?: string;
  progress?: number;
  targetDate?: string;
  areaId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const existing = await prisma.goal.findFirst({
    where: { id: args.goalId, userId },
  });
  if (!existing) {
    return JSON.stringify({ success: false, error: "Goal not found" });
  }

  const data: Prisma.GoalUpdateInput = {};
  if (args.title !== undefined) data.title = args.title;
  if (args.description !== undefined) data.description = args.description;
  if (args.status !== undefined) data.status = args.status as GoalStatus;
  if (args.progress !== undefined) data.progress = args.progress;
  if (args.targetDate !== undefined)
    data.targetDate = new Date(args.targetDate);
  if (args.areaId !== undefined)
    data.area = args.areaId ? { connect: { id: args.areaId } } : { disconnect: true };

  const goal = await prisma.goal.update({
    where: { id: args.goalId },
    data,
    include: {
      area: { select: { id: true, name: true } },
    },
  });

  return JSON.stringify(
    {
      success: true,
      goal: {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        status: goal.status,
        horizon: goal.horizon,
        progress: goal.progress,
        targetDate: goal.targetDate?.toISOString() ?? null,
        area: goal.area,
      },
      message: `Updated goal: "${goal.title}"`,
    },
    null,
    2
  );
}

async function handleAreaList(args: {
  activeOnly?: boolean;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const activeOnly = args.activeOnly !== false; // default true

  const where: Prisma.AreaWhereInput = { userId };
  if (activeOnly) {
    where.isActive = true;
  }

  const areas = await prisma.area.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: {
          projects: true,
          goals: true,
        },
      },
    },
  });

  return JSON.stringify(
    {
      areas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        isActive: a.isActive,
        projectCount: a._count.projects,
        goalCount: a._count.goals,
      })),
      total: areas.length,
    },
    null,
    2
  );
}

async function handleAreaCreate(args: {
  name: string;
  description?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const area = await prisma.area.create({
    data: {
      name: args.name,
      description: args.description ?? null,
      userId,
    },
  });

  return JSON.stringify(
    {
      success: true,
      area: {
        id: area.id,
        name: area.name,
        description: area.description,
        isActive: area.isActive,
      },
      message: `Created area: "${area.name}"`,
    },
    null,
    2
  );
}

async function handleHorizonReviewStatus(): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const [noteCount, latestCompleted, currentInProgress] = await Promise.all([
    prisma.horizonNote.count({ where: { userId } }),
    prisma.horizonReview.findFirst({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    }),
    prisma.horizonReview.findFirst({
      where: { userId, status: "IN_PROGRESS" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Check if user has completed initial setup
  const hasCompletedSetup = await prisma.horizonReview.count({
    where: { userId, type: "INITIAL_SETUP", status: "COMPLETED" },
  });

  const now = new Date();
  const daysSinceReview = latestCompleted?.completedAt
    ? Math.floor(
        (now.getTime() - latestCompleted.completedAt.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const isOverdue = daysSinceReview === null || daysSinceReview > 90;

  return JSON.stringify(
    {
      hasNotes: noteCount > 0,
      noteCount,
      lastReviewDate: latestCompleted?.completedAt?.toISOString() ?? null,
      lastReviewType: latestCompleted?.type ?? null,
      daysSinceReview,
      isOverdue,
      hasCompletedSetup: hasCompletedSetup > 0,
      currentInProgress: currentInProgress
        ? { id: currentInProgress.id, type: currentInProgress.type }
        : null,
      message: isOverdue
        ? daysSinceReview !== null
          ? `Horizon review is overdue (${daysSinceReview} days since last review). Consider a quarterly check-in.`
          : "No horizon reviews on record. Consider starting with an initial setup to define your purpose, vision, and goals."
        : `Last horizon review completed ${daysSinceReview} day${daysSinceReview === 1 ? "" : "s"} ago.`,
    },
    null,
    2
  );
}

// =============================================================================
// Team Management Handlers
// =============================================================================

async function handleTeamList(): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          _count: { select: { members: true, projects: true } },
        },
      },
    },
  });

  return JSON.stringify(
    {
      teams: memberships.map((m) => ({
        id: m.team.id,
        name: m.team.name,
        description: m.team.description,
        role: m.role,
        memberCount: m.team._count.members,
        projectCount: m.team._count.projects,
        joinedAt: m.joinedAt.toISOString(),
      })),
      total: memberships.length,
    },
    null,
    2
  );
}

async function handleTeamCreate(args: {
  name: string;
  description?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Check server settings
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
  });
  if (settings && !settings.teamsEnabled) {
    throw new Error("Teams are not enabled on this server");
  }
  if (settings?.teamsAdminOnly) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      throw new Error("Only server admins can create teams");
    }
  }

  const team = await prisma.team.create({
    data: {
      name: args.name,
      description: args.description ?? null,
      createdById: userId,
      members: {
        create: {
          userId,
          role: "ADMIN",
        },
      },
    },
    include: {
      _count: { select: { members: true } },
    },
  });

  return JSON.stringify(
    {
      success: true,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        memberCount: team._count.members,
      },
      message: `Created team: "${team.name}"`,
    },
    null,
    2
  );
}

async function handleTeamMembers(args: {
  teamId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  await mcpRequireTeamMember(userId, args.teamId);

  const members = await prisma.teamMember.findMany({
    where: { teamId: args.teamId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return JSON.stringify(
    {
      teamId: args.teamId,
      members: members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        label: m.label,
        joinedAt: m.joinedAt.toISOString(),
      })),
      total: members.length,
    },
    null,
    2
  );
}

async function handleTeamAddMember(args: {
  teamId: string;
  userEmail: string;
  role?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  await mcpRequireTeamAdmin(userId, args.teamId);

  // Look up user by email
  const targetUser = await prisma.user.findUnique({
    where: { email: args.userEmail },
    select: { id: true, name: true, email: true },
  });
  if (!targetUser) {
    throw new Error(`No user found with email: ${args.userEmail}`);
  }

  // Check if already a member
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: args.teamId, userId: targetUser.id } },
  });
  if (existing) {
    throw new Error(`${targetUser.email} is already a member of this team`);
  }

  const role = (args.role as "MEMBER" | "ADMIN") ?? "MEMBER";
  await prisma.teamMember.create({
    data: {
      teamId: args.teamId,
      userId: targetUser.id,
      role,
    },
  });

  return JSON.stringify(
    {
      success: true,
      member: {
        userId: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role,
      },
      message: `Added ${targetUser.email} to team as ${role.toLowerCase()}`,
    },
    null,
    2
  );
}

async function handleTeamRemoveMember(args: {
  teamId: string;
  userId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const currentUserId = getUserId();

  await mcpRequireTeamAdmin(currentUserId, args.teamId);

  // Verify target is a member
  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: args.teamId, userId: args.userId } },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!targetMember) {
    throw new Error("User is not a member of this team");
  }

  // Prevent removing the last admin
  if (targetMember.role === "ADMIN") {
    const adminCount = await prisma.teamMember.count({
      where: { teamId: args.teamId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw new Error("Cannot remove the last admin from a team");
    }
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId: args.teamId, userId: args.userId } },
  });

  return JSON.stringify(
    {
      success: true,
      message: `Removed ${targetMember.user.email} from team`,
    },
    null,
    2
  );
}

async function handleTaskAssign(args: {
  taskId: string;
  assignToEmail?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Find the task with its project
  const task = await prisma.task.findFirst({
    where: { id: args.taskId },
    include: { project: { select: { id: true, teamId: true, title: true } } },
  });
  if (!task) {
    throw new Error("Task not found");
  }

  // Task must be in a team project for assignment
  if (!task.project?.teamId) {
    throw new Error("Task assignment is only available for tasks in team projects");
  }

  const teamId = task.project.teamId;

  // Verify current user is a team member
  await mcpRequireTeamMember(userId, teamId);

  if (!args.assignToEmail) {
    // Unassign
    await prisma.task.update({
      where: { id: args.taskId },
      data: { assignedToId: null, version: { increment: 1 } },
    });
    return JSON.stringify(
      { success: true, message: `Unassigned task: "${task.title}"` },
      null,
      2
    );
  }

  // Look up assignee by email
  const assignee = await prisma.user.findUnique({
    where: { email: args.assignToEmail },
    select: { id: true, name: true, email: true },
  });
  if (!assignee) {
    throw new Error(`No user found with email: ${args.assignToEmail}`);
  }

  // Verify assignee is a team member
  const assigneeIsMember = await mcpIsTeamMember(assignee.id, teamId);
  if (!assigneeIsMember) {
    throw new Error(`${assignee.email} is not a member of this team`);
  }

  await prisma.task.update({
    where: { id: args.taskId },
    data: { assignedToId: assignee.id, version: { increment: 1 } },
  });

  return JSON.stringify(
    {
      success: true,
      task: { id: task.id, title: task.title },
      assignedTo: { userId: assignee.id, name: assignee.name, email: assignee.email },
      message: `Assigned "${task.title}" to ${assignee.name ?? assignee.email}`,
    },
    null,
    2
  );
}

// =============================================================================
// Task & Inbox CRUD Handlers
// =============================================================================

async function handleTaskUpdate(args: {
  taskId: string;
  title?: string;
  notes?: string;
  status?: string;
  energyLevel?: string;
  estimatedMins?: number;
  dueDate?: string;
  scheduledDate?: string;
  contextId?: string;
  projectId?: string;
  isNextAction?: boolean;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Verify task exists and user has access
  const teamIds = await mcpGetUserTeamIds(userId);
  const existing = await prisma.task.findFirst({
    where: {
      id: args.taskId,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ project: { teamId: { in: teamIds } } }] : []),
      ],
    },
    include: {
      project: { select: { id: true, title: true, type: true, teamId: true } },
      context: { select: { id: true, name: true } },
    },
  });
  if (!existing) {
    return JSON.stringify({ success: false, error: "Task not found" });
  }

  // Build update data from provided fields only
  const data: Record<string, unknown> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  if (args.title !== undefined) {
    data.title = args.title;
    changes.title = { old: existing.title, new: args.title };
  }
  if (args.notes !== undefined) {
    data.notes = args.notes || null;
    changes.notes = { old: existing.notes, new: data.notes };
  }
  if (args.status !== undefined) {
    data.status = args.status as TaskStatus;
    changes.status = { old: existing.status, new: args.status };
  }
  if (args.energyLevel !== undefined) {
    data.energyLevel = args.energyLevel ? (args.energyLevel as EnergyLevel) : null;
    changes.energyLevel = { old: existing.energyLevel, new: data.energyLevel };
  }
  if (args.estimatedMins !== undefined) {
    data.estimatedMins = args.estimatedMins || null;
    changes.estimatedMins = { old: existing.estimatedMins, new: data.estimatedMins };
  }
  if (args.dueDate !== undefined) {
    data.dueDate = args.dueDate ? new Date(args.dueDate) : null;
    changes.dueDate = {
      old: existing.dueDate?.toISOString() ?? null,
      new: args.dueDate || null,
    };
  }
  if (args.scheduledDate !== undefined) {
    data.scheduledDate = args.scheduledDate ? new Date(args.scheduledDate) : null;
    changes.scheduledDate = {
      old: existing.scheduledDate?.toISOString() ?? null,
      new: args.scheduledDate || null,
    };
  }
  if (args.contextId !== undefined) {
    data.contextId = args.contextId || null;
    changes.contextId = { old: existing.contextId, new: data.contextId };
  }
  if (args.projectId !== undefined) {
    data.projectId = args.projectId || null;
    changes.projectId = { old: existing.projectId, new: data.projectId };
  }
  if (args.isNextAction !== undefined) {
    data.isNextAction = args.isNextAction;
    changes.isNextAction = { old: existing.isNextAction, new: args.isNextAction };
  }

  if (Object.keys(data).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  // Update task with optimistic concurrency (retry once on conflict)
  const doUpdate = async (retryVersion?: number) => {
    const version = retryVersion ?? existing.version;
    const result = await prisma.$transaction(async (tx) => {
      // Atomic version check
      const count = await tx.task.updateMany({
        where: { id: args.taskId, version },
        data: { ...data, version: { increment: 1 } },
      });

      if (count.count === 0) {
        return null; // Version mismatch
      }

      // Re-fetch with includes since updateMany doesn't return the record
      const task = await tx.task.findUniqueOrThrow({
        where: { id: args.taskId },
        include: {
          project: { select: { id: true, title: true } },
          context: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: args.taskId,
          eventType: "UPDATED",
          actorType: "AI",
          actorId: userId,
          changes: changes as unknown as Prisma.InputJsonValue,
          source: "MCP",
        },
      });

      return task;
    });
    return result;
  };

  let updated = await doUpdate();
  if (!updated) {
    // Retry once with fresh version
    const fresh = await prisma.task.findUnique({ where: { id: args.taskId }, select: { version: true } });
    if (fresh) {
      updated = await doUpdate(fresh.version);
    }
  }
  if (!updated) {
    return JSON.stringify({ success: false, error: "Version conflict: task was modified concurrently. Please try again." });
  }

  return JSON.stringify(
    {
      success: true,
      task: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        isNextAction: updated.isNextAction,
        project: updated.project,
        context: updated.context,
        assignedTo: updated.assignedTo,
        energyLevel: updated.energyLevel,
        estimatedMins: updated.estimatedMins,
        scheduledDate: updated.scheduledDate?.toISOString() ?? null,
        dueDate: updated.dueDate?.toISOString() ?? null,
        notes: updated.notes,
        version: updated.version,
      },
      message: `Updated task: "${updated.title}"`,
    },
    null,
    2
  );
}

async function handleTaskBulkUpdate(args: {
  taskIds: string[];
  updates: { contextId?: string | null };
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const { taskIds, updates } = args;

  if (!taskIds || taskIds.length === 0) {
    return JSON.stringify({ success: false, error: "At least 1 task ID required" });
  }
  if (taskIds.length > 100) {
    return JSON.stringify({ success: false, error: "Maximum 100 tasks per batch" });
  }

  // Resolve contextId: empty string means clear
  const contextId = updates.contextId === "" ? null : (updates.contextId ?? null);

  // Verify ownership/team access for all tasks
  const teamIds = await mcpGetUserTeamIds(userId);
  const tasks = await prisma.task.findMany({
    where: {
      id: { in: taskIds },
      OR: [
        { userId },
        ...(teamIds.length > 0
          ? [{ project: { teamId: { in: teamIds } } }]
          : []),
      ],
    },
    select: { id: true, contextId: true },
  });

  const accessibleIds = new Set(tasks.map((t) => t.id));
  const errors: string[] = [];
  for (const id of taskIds) {
    if (!accessibleIds.has(id)) {
      errors.push(`Task ${id} not found or not accessible`);
    }
  }

  let updated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const task of tasks) {
      if (task.contextId === contextId) {
        skipped++;
        continue;
      }

      await tx.task.update({
        where: { id: task.id },
        data: { contextId, version: { increment: 1 } },
      });

      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          eventType: "CONTEXT_CHANGED",
          actorType: "AI",
          actorId: userId,
          changes: {
            contextId: { old: task.contextId, new: contextId },
          } as unknown as Prisma.InputJsonValue,
          source: "MCP",
          message: `Bulk context change (${tasks.length} tasks)`,
        },
      });

      updated++;
    }
  });

  return JSON.stringify(
    {
      success: true,
      updated,
      skipped,
      errors,
      message: `Bulk update complete: ${updated} updated, ${skipped} skipped${errors.length > 0 ? `, ${errors.length} errors` : ""}`,
    },
    null,
    2
  );
}

async function handleTaskDelete(args: {
  taskId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Verify task exists and user has access
  const teamIds = await mcpGetUserTeamIds(userId);
  const existing = await prisma.task.findFirst({
    where: {
      id: args.taskId,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ project: { teamId: { in: teamIds } } }] : []),
      ],
    },
    select: { id: true, title: true, userId: true, project: { select: { teamId: true } } },
  });
  if (!existing) {
    return JSON.stringify({ success: false, error: "Task not found" });
  }

  // For team tasks, require ownership or team admin
  if (existing.project?.teamId && existing.userId !== userId) {
    await mcpRequireTeamAdmin(userId, existing.project.teamId);
  }

  const title = existing.title;
  await prisma.task.delete({ where: { id: args.taskId } });

  return JSON.stringify(
    {
      success: true,
      message: `Deleted task: "${title}"`,
    },
    null,
    2
  );
}

async function handleInboxUpdate(args: {
  itemId: string;
  content?: string;
  notes?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const existing = await prisma.inboxItem.findFirst({
    where: { id: args.itemId, userId },
  });
  if (!existing) {
    return JSON.stringify({ success: false, error: "Inbox item not found" });
  }

  const data: Record<string, unknown> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  if (args.content !== undefined) {
    data.content = args.content;
    changes.content = { old: existing.content, new: args.content };
  }
  if (args.notes !== undefined) {
    data.notes = args.notes || null;
    changes.notes = { old: existing.notes, new: data.notes };
  }

  if (Object.keys(data).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.inboxItem.update({
      where: { id: args.itemId },
      data,
    });

    await tx.inboxEvent.create({
      data: {
        inboxItemId: args.itemId,
        eventType: "CAPTURED",
        actorType: "AI",
        actorId: userId,
        changes: changes as unknown as Prisma.InputJsonValue,
        source: "MCP",
      },
    });

    return item;
  });

  return JSON.stringify(
    {
      success: true,
      item: {
        id: updated.id,
        content: updated.content,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
      },
      message: `Updated inbox item: "${updated.content}"`,
    },
    null,
    2
  );
}

async function handleInboxDelete(args: {
  itemId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const existing = await prisma.inboxItem.findFirst({
    where: { id: args.itemId, userId },
  });
  if (!existing) {
    return JSON.stringify({ success: false, error: "Inbox item not found" });
  }

  const content = existing.content;
  await prisma.inboxItem.delete({ where: { id: args.itemId } });

  return JSON.stringify(
    {
      success: true,
      message: `Deleted inbox item: "${content}"`,
    },
    null,
    2
  );
}

// =============================================================================
// Wiki Helpers
// =============================================================================

/**
 * Extract [[wikilink]] targets from content and return deduplicated slugs.
 */
function extractWikilinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const slugs = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    slugs.add(slugify(match[1]));
  }
  return Array.from(slugs);
}

/**
 * Sync WikiBacklink rows for an article (MCP version using getPrisma()).
 */
async function mcpSyncBacklinks(
  articleId: string,
  content: string,
  userId: string,
  teamId: string | null
) {
  const prisma = getPrisma();
  const slugs = extractWikilinks(content);

  if (slugs.length === 0) {
    await prisma.wikiBacklink.deleteMany({ where: { sourceArticleId: articleId } });
    return;
  }

  const scopeWhere = teamId
    ? { teamId, slug: { in: slugs }, id: { not: articleId } }
    : { userId, teamId: null as string | null, slug: { in: slugs }, id: { not: articleId } };

  const targets = await prisma.wikiArticle.findMany({
    where: scopeWhere,
    select: { id: true },
  });

  const targetIds = targets.map((t) => t.id);

  await prisma.$transaction([
    prisma.wikiBacklink.deleteMany({ where: { sourceArticleId: articleId } }),
    ...(targetIds.length > 0
      ? [
          prisma.wikiBacklink.createMany({
            data: targetIds.map((targetId) => ({
              sourceArticleId: articleId,
              targetArticleId: targetId,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

// Wiki Handlers
// =============================================================================

/**
 * Find an article by slug with fallback: personal → team articles.
 * Mirrors the web app pattern in wiki-helpers.ts + [slug]/route.ts.
 */
async function mcpFindArticle(
  slug: string,
  userId: string,
  teamId?: string
) {
  const prisma = getPrisma();
  const select = {
    id: true,
    slug: true,
    title: true,
    content: true,
    tags: true,
    teamId: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
    version: true,
  } as const;

  if (teamId) {
    await mcpRequireTeamMember(userId, teamId);
    return prisma.wikiArticle.findFirst({ where: { teamId, slug }, select });
  }

  // Personal first
  const personal = await prisma.wikiArticle.findUnique({
    where: { userId_slug: { userId, slug } },
    select,
  });
  if (personal) return personal;

  // Fallback to team articles
  const teamIds = await mcpGetUserTeamIds(userId);
  if (teamIds.length > 0) {
    return prisma.wikiArticle.findFirst({
      where: { slug, teamId: { in: teamIds } },
      select,
    });
  }

  return null;
}

async function handleWikiSearch(args: {
  query?: string;
  tag?: string;
  teamId?: string;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 20;

  if (!args.query && !args.tag) {
    throw new Error("At least one of query or tag is required");
  }

  // If we have a text query, use FTS via $queryRaw
  if (args.query) {
    // Build ownership SQL
    let ownershipSql: Prisma.Sql;
    if (args.teamId) {
      await mcpRequireTeamMember(userId, args.teamId);
      ownershipSql = Prisma.sql`w.team_id = ${args.teamId}`;
    } else {
      const teamIds = await mcpGetUserTeamIds(userId);
      if (teamIds.length > 0) {
        ownershipSql = Prisma.sql`(w."userId" = ${userId} AND w.team_id IS NULL OR w.team_id = ANY(${teamIds}::text[]))`;
      } else {
        ownershipSql = Prisma.sql`(w."userId" = ${userId} AND w.team_id IS NULL)`;
      }
    }

    const tagSql = args.tag
      ? Prisma.sql`AND ${args.tag} = ANY(w.tags)`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<
      { slug: string; title: string; tags: string[]; team_id: string | null; updatedAt: Date; snippet: string }[]
    >`
      SELECT
        w.slug,
        w.title,
        w.tags,
        w.team_id,
        w."updatedAt",
        ts_headline('english', w.content, plainto_tsquery('english', ${args.query}),
          'MaxWords=35, MinWords=15, StartSel=**, StopSel=**') AS snippet
      FROM "WikiArticle" w
      WHERE ${ownershipSql}
        AND w.search_vector @@ plainto_tsquery('english', ${args.query})
        ${tagSql}
      ORDER BY ts_rank(w.search_vector, plainto_tsquery('english', ${args.query})) DESC
      LIMIT ${limit}
    `;

    return JSON.stringify(
      {
        articles: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          tags: r.tags,
          teamId: r.team_id,
          snippet: r.snippet,
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        })),
        total: rows.length,
      },
      null,
      2
    );
  }

  // Tag-only filter (no text query) — use Prisma ORM
  let scopeFilter: Prisma.WikiArticleWhereInput;
  if (args.teamId) {
    await mcpRequireTeamMember(userId, args.teamId);
    scopeFilter = { teamId: args.teamId };
  } else {
    const teamIds = await mcpGetUserTeamIds(userId);
    if (teamIds.length > 0) {
      scopeFilter = {
        OR: [
          { userId, teamId: null },
          { teamId: { in: teamIds } },
        ],
      };
    } else {
      scopeFilter = { userId, teamId: null };
    }
  }

  const articles = await prisma.wikiArticle.findMany({
    where: { ...scopeFilter, tags: { has: args.tag! } },
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: {
      slug: true,
      title: true,
      tags: true,
      teamId: true,
      updatedAt: true,
      content: true,
    },
  });

  return JSON.stringify(
    {
      articles: articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        tags: a.tags,
        teamId: a.teamId,
        snippet: a.content.slice(0, 200) + (a.content.length > 200 ? "…" : ""),
        updatedAt: a.updatedAt.toISOString(),
      })),
      total: articles.length,
    },
    null,
    2
  );
}

async function handleWikiRead(args: {
  slug: string;
  teamId?: string;
}): Promise<string> {
  const userId = getUserId();

  const article = await mcpFindArticle(args.slug, userId, args.teamId);
  if (!article) {
    return JSON.stringify({ error: "Article not found" });
  }

  return JSON.stringify(
    {
      slug: article.slug,
      title: article.title,
      content: article.content,
      tags: article.tags,
      teamId: article.teamId,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    },
    null,
    2
  );
}

async function handleWikiCreate(args: {
  title: string;
  content: string;
  tags?: string[];
  slug?: string;
  teamId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const articleSlug = args.slug || slugify(args.title);
  const tags = args.tags ?? [];

  if (args.teamId) {
    await mcpRequireTeamMember(userId, args.teamId);

    // Check slug uniqueness within team
    const existing = await prisma.wikiArticle.findFirst({
      where: { teamId: args.teamId, slug: articleSlug },
    });
    if (existing) {
      throw new Error(`An article with slug "${articleSlug}" already exists in this team`);
    }
  } else {
    // Check slug uniqueness for personal articles
    const existing = await prisma.wikiArticle.findUnique({
      where: { userId_slug: { userId, slug: articleSlug } },
    });
    if (existing) {
      throw new Error(`An article with slug "${articleSlug}" already exists`);
    }
  }

  const article = await prisma.wikiArticle.create({
    data: {
      title: args.title,
      slug: articleSlug,
      content: args.content,
      tags,
      userId,
      teamId: args.teamId ?? null,
    },
  });

  // Create initial version snapshot (version 1)
  await prisma.wikiArticleVersion.create({
    data: {
      articleId: article.id,
      version: 1,
      title: article.title,
      content: article.content,
      tags: article.tags,
      message: "Initial version",
      actorId: userId,
    },
  });

  // Sync backlinks from wikilink references
  await mcpSyncBacklinks(article.id, article.content, userId, args.teamId ?? null);

  return JSON.stringify(
    {
      success: true,
      article: {
        slug: article.slug,
        title: article.title,
        tags: article.tags,
        teamId: article.teamId,
        createdAt: article.createdAt.toISOString(),
      },
      message: `Created article: "${article.title}"`,
    },
    null,
    2
  );
}

async function handleWikiUpdate(args: {
  slug: string;
  title?: string;
  content?: string;
  tags?: string[];
  message?: string;
  teamId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const existing = await mcpFindArticle(args.slug, userId, args.teamId);
  if (!existing) {
    throw new Error("Article not found");
  }

  // Build update data
  const updateData: Record<string, unknown> = {};
  if (args.title !== undefined) {
    updateData.title = args.title;
    // Auto-update slug if title changes
    updateData.slug = slugify(args.title);
  }
  if (args.content !== undefined) updateData.content = args.content;
  if (args.tags !== undefined) updateData.tags = args.tags;

  if (Object.keys(updateData).length === 0 && !args.message) {
    throw new Error("No changes provided");
  }

  // Get next version number
  const latestVersion = await prisma.wikiArticleVersion.findFirst({
    where: { articleId: existing.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Update article with version increment, retry once on conflict
  const doWikiUpdate = async (expectedVersion: number) => {
    if (Object.keys(updateData).length > 0) {
      const result = await prisma.wikiArticle.updateMany({
        where: { id: existing.id, version: expectedVersion },
        data: { ...updateData, version: { increment: 1 } },
      });
      return result.count > 0;
    }
    return true; // No field changes, just a version/message snapshot
  };

  let updated = await doWikiUpdate(existing.version);
  if (!updated) {
    // Retry once with fresh version
    const fresh = await prisma.wikiArticle.findUnique({ where: { id: existing.id }, select: { version: true } });
    if (fresh) {
      updated = await doWikiUpdate(fresh.version);
    }
  }
  if (!updated) {
    return JSON.stringify({ success: false, error: "Version conflict: article was modified concurrently. Please try again." });
  }

  const article = await prisma.wikiArticle.findUniqueOrThrow({ where: { id: existing.id } });

  await prisma.wikiArticleVersion.create({
    data: {
      articleId: existing.id,
      version: nextVersion,
      title: article.title,
      content: article.content,
      tags: article.tags,
      message: args.message || null,
      actorId: userId,
    },
  });

  // Re-sync backlinks if content changed
  if (args.content !== undefined) {
    await mcpSyncBacklinks(existing.id, article.content, userId, article.teamId);
  }

  return JSON.stringify(
    {
      success: true,
      article: {
        slug: article.slug,
        title: article.title,
        tags: article.tags,
        teamId: article.teamId,
        updatedAt: article.updatedAt.toISOString(),
        version: article.version,
        snapshotVersion: nextVersion,
      },
      message: `Updated article: "${article.title}" (v${nextVersion})`,
    },
    null,
    2
  );
}

async function handleWikiDelete(args: {
  slug: string;
  teamId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const existing = await mcpFindArticle(args.slug, userId, args.teamId);
  if (!existing) {
    throw new Error("Article not found");
  }

  // Team articles require admin
  if (existing.teamId) {
    await mcpRequireTeamAdmin(userId, existing.teamId);
  }

  await prisma.wikiArticle.delete({ where: { id: existing.id } });

  return JSON.stringify(
    {
      success: true,
      message: `Deleted article: "${existing.title}"`,
    },
    null,
    2
  );
}

async function handleWikiHistory(args: {
  slug: string;
  teamId?: string;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 20;

  const article = await mcpFindArticle(args.slug, userId, args.teamId);
  if (!article) {
    throw new Error("Article not found");
  }

  const versions = await prisma.wikiArticleVersion.findMany({
    where: { articleId: article.id },
    orderBy: { version: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  return JSON.stringify(
    {
      slug: article.slug,
      title: article.title,
      versions: versions.map((v) => ({
        version: v.version,
        message: v.message,
        editor: v.actor
          ? { name: v.actor.name, email: v.actor.email }
          : null,
        createdAt: v.createdAt.toISOString(),
      })),
      total: versions.length,
    },
    null,
    2
  );
}

async function handleWikiBacklinks(args: {
  slug: string;
  teamId?: string;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();
  const limit = args.limit ?? 50;

  // Find the target article
  const target = await mcpFindArticle(args.slug, userId, args.teamId);
  if (!target) {
    return JSON.stringify({ targetSlug: args.slug, backlinks: [], total: 0 });
  }

  // Query backlinks from the join table
  const backlinks = await prisma.wikiBacklink.findMany({
    where: { targetArticleId: target.id },
    take: limit,
    select: {
      sourceArticle: {
        select: { slug: true, title: true, teamId: true, updatedAt: true },
      },
    },
    orderBy: { sourceArticle: { updatedAt: "desc" } },
  });

  return JSON.stringify(
    {
      targetSlug: args.slug,
      backlinks: backlinks.map((bl) => ({
        slug: bl.sourceArticle.slug,
        title: bl.sourceArticle.title,
        teamId: bl.sourceArticle.teamId,
        updatedAt: bl.sourceArticle.updatedAt.toISOString(),
      })),
      total: backlinks.length,
    },
    null,
    2
  );
}

// =============================================================================
// History Tool Handlers
// =============================================================================

async function handleTaskHistory(args: {
  taskId: string;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Verify task belongs to user
  const task = await prisma.task.findFirst({
    where: { id: args.taskId, userId },
    select: { id: true, title: true },
  });
  if (!task) {
    return JSON.stringify({ error: "Task not found" });
  }

  const limit = Math.min(args.limit ?? 20, 100);

  const events = await prisma.taskEvent.findMany({
    where: { taskId: args.taskId },
    include: {
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (events.length === 0) {
    return JSON.stringify({
      taskId: args.taskId,
      taskTitle: task.title,
      events: [],
      message: "No history events found for this task.",
    }, null, 2);
  }

  const lines: string[] = [];
  lines.push(`History for "${task.title}" (${events.length} events):`);
  lines.push("");

  for (const event of events) {
    const actorName =
      event.actor?.name ??
      (event.actorType === "SYSTEM" ? "System" : "AI Assistant");
    const time = formatRelativeTime(event.createdAt.toISOString());
    const changes = (event.changes ?? {}) as Record<
      string,
      { old: unknown; new: unknown }
    >;
    const description = formatEventDescription({
      eventType: event.eventType,
      changes,
      actorType: event.actorType,
      source: event.source,
    });

    lines.push(`[${time}] ${actorName}: ${description}`);

    // Show field-level changes
    for (const [field, change] of Object.entries(changes)) {
      lines.push(`  ${formatFieldChange(field, change.old, change.new)}`);
    }

    if (event.message) {
      lines.push(`  Note: ${event.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function handleActivityFeed(args: {
  days?: number;
  source?: string;
  limit?: number;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const days = args.days ?? 7;
  const limit = Math.min(args.limit ?? 30, 100);
  const perTypeLimit = limit + 1;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Build source filter
  const sourceFilter =
    args.source && args.source !== "all"
      ? { in: [args.source.toUpperCase()] }
      : undefined;

  interface FeedItem {
    entityType: string;
    entityTitle: string;
    eventType: string;
    actorType: string;
    actorName: string;
    changes: Record<string, { old: unknown; new: unknown }>;
    source: string;
    createdAt: string;
  }

  const feedItems: FeedItem[] = [];

  // Fetch task events
  const taskWhere: Record<string, unknown> = {
    task: { userId },
    createdAt: { gte: cutoff },
  };
  if (sourceFilter) taskWhere.source = sourceFilter;

  const taskEvents = await prisma.taskEvent.findMany({
    where: taskWhere,
    include: {
      actor: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: perTypeLimit,
  });

  for (const e of taskEvents) {
    feedItems.push({
      entityType: "task",
      entityTitle: e.task.title,
      eventType: e.eventType,
      actorType: e.actorType,
      actorName:
        e.actor?.name ??
        (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
      changes: (e.changes ?? {}) as Record<
        string,
        { old: unknown; new: unknown }
      >,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    });
  }

  // Fetch project events
  const projectWhere: Record<string, unknown> = {
    project: { userId },
    createdAt: { gte: cutoff },
  };
  if (sourceFilter) projectWhere.source = sourceFilter;

  const projectEvents = await prisma.projectEvent.findMany({
    where: projectWhere,
    include: {
      actor: { select: { id: true, name: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: perTypeLimit,
  });

  for (const e of projectEvents) {
    feedItems.push({
      entityType: "project",
      entityTitle: e.project.title,
      eventType: e.eventType,
      actorType: e.actorType,
      actorName:
        e.actor?.name ??
        (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
      changes: (e.changes ?? {}) as Record<
        string,
        { old: unknown; new: unknown }
      >,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    });
  }

  // Fetch inbox events
  const inboxWhere: Record<string, unknown> = {
    inboxItem: { userId },
    createdAt: { gte: cutoff },
  };
  if (sourceFilter) inboxWhere.source = sourceFilter;

  const inboxEvents = await prisma.inboxEvent.findMany({
    where: inboxWhere,
    include: {
      actor: { select: { id: true, name: true } },
      inboxItem: { select: { id: true, content: true } },
    },
    orderBy: { createdAt: "desc" },
    take: perTypeLimit,
  });

  for (const e of inboxEvents) {
    feedItems.push({
      entityType: "inbox",
      entityTitle: e.inboxItem.content.slice(0, 80),
      eventType: e.eventType,
      actorType: e.actorType,
      actorName:
        e.actor?.name ??
        (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
      changes: (e.changes ?? {}) as Record<
        string,
        { old: unknown; new: unknown }
      >,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    });
  }

  // Sort by date descending and trim
  feedItems.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const trimmed = feedItems.slice(0, limit);

  if (trimmed.length === 0) {
    return `No activity found in the last ${days} day(s).`;
  }

  const lines: string[] = [];
  lines.push(`Activity feed (last ${days} day(s), ${trimmed.length} events):`);
  lines.push("");

  for (const item of trimmed) {
    const time = formatRelativeTime(item.createdAt);
    const description = formatEventDescription({
      eventType: item.eventType,
      changes: item.changes,
      actorType: item.actorType,
      source: item.source,
    });
    const typeLabel =
      item.entityType === "task"
        ? "Task"
        : item.entityType === "project"
          ? "Project"
          : "Inbox";

    lines.push(
      `[${time}] ${typeLabel}: "${item.entityTitle}" — ${description}`
    );
  }

  return lines.join("\n");
}

async function handleWeeklySummary(args: {
  weekOf?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Compute week boundaries
  let weekStart: Date;
  if (args.weekOf) {
    weekStart = new Date(args.weekOf);
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
    weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - diff
    );
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const dateRange = { gte: weekStart, lt: weekEnd };

  // Counts
  const [tasksCompleted, tasksCreated, cascadeEvents] = await Promise.all([
    prisma.taskEvent.count({
      where: { task: { userId }, eventType: "COMPLETED", createdAt: dateRange },
    }),
    prisma.taskEvent.count({
      where: { task: { userId }, eventType: "CREATED", createdAt: dateRange },
    }),
    prisma.taskEvent.count({
      where: { task: { userId }, source: "CASCADE", createdAt: dateRange },
    }),
  ]);

  // Most active projects (by event count)
  const projectEventCounts = new Map<
    string,
    { id: string; title: string; count: number }
  >();

  const projectEvents = await prisma.projectEvent.findMany({
    where: { project: { userId }, createdAt: dateRange },
    select: {
      projectId: true,
      project: { select: { id: true, title: true } },
    },
  });

  for (const pe of projectEvents) {
    const existing = projectEventCounts.get(pe.projectId);
    if (existing) {
      existing.count += 1;
    } else {
      projectEventCounts.set(pe.projectId, {
        id: pe.project.id,
        title: pe.project.title,
        count: 1,
      });
    }
  }

  const taskEventsInProjects = await prisma.taskEvent.findMany({
    where: {
      task: { userId, projectId: { not: null } },
      createdAt: dateRange,
    },
    select: {
      task: {
        select: {
          projectId: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
  });

  for (const te of taskEventsInProjects) {
    if (!te.task.projectId || !te.task.project) continue;
    const existing = projectEventCounts.get(te.task.projectId);
    if (existing) {
      existing.count += 1;
    } else {
      projectEventCounts.set(te.task.projectId, {
        id: te.task.project.id,
        title: te.task.project.title,
        count: 1,
      });
    }
  }

  const mostActiveProjects = Array.from(projectEventCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Projects with completions this week
  const projectsWithCompletions = await prisma.taskEvent.findMany({
    where: {
      task: { userId, projectId: { not: null } },
      eventType: "COMPLETED",
      createdAt: dateRange,
    },
    select: {
      task: {
        select: {
          projectId: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
    distinct: ["taskId"],
  });

  const advancedProjectMap = new Map<
    string,
    { id: string; title: string }
  >();
  for (const te of projectsWithCompletions) {
    if (te.task.projectId && te.task.project) {
      advancedProjectMap.set(te.task.projectId, {
        id: te.task.project.id,
        title: te.task.project.title,
      });
    }
  }
  const projectsAdvanced = Array.from(advancedProjectMap.values());

  // Stale projects: active with no events this week
  const activeProjects = await prisma.project.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, title: true },
  });

  const activeProjectIdsWithEvents = new Set(projectEventCounts.keys());
  const staleProjects = activeProjects.filter(
    (p) => !activeProjectIdsWithEvents.has(p.id)
  );

  // Build output
  const weekLabel = weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const lines: string[] = [];

  lines.push(`Weekly Summary — week of ${weekLabel}`);
  lines.push("");
  lines.push(`Tasks completed: ${tasksCompleted}`);
  lines.push(`Tasks created: ${tasksCreated}`);
  lines.push(`Cascade events: ${cascadeEvents}`);
  lines.push(`Projects advanced: ${projectsAdvanced.length}`);

  if (projectsAdvanced.length > 0) {
    for (const p of projectsAdvanced) {
      lines.push(`  - ${p.title}`);
    }
  }

  if (mostActiveProjects.length > 0) {
    lines.push("");
    lines.push("Most active projects:");
    for (const p of mostActiveProjects) {
      lines.push(`  - ${p.title} (${p.count} events)`);
    }
  }

  if (staleProjects.length > 0) {
    lines.push("");
    lines.push(`Stale projects (${staleProjects.length} active with no activity):`);
    for (const p of staleProjects) {
      lines.push(`  - ${p.title}`);
    }
  }

  return lines.join("\n");
}

interface CascadeNode {
  id: string;
  type: "task" | "project" | "goal";
  title: string;
  eventType: string;
  timestamp: string;
  children: CascadeNode[];
}

async function findTriggeredEvents(
  prisma: ReturnType<typeof getPrisma>,
  triggeredById: string,
  userId: string,
  depth: number = 0
): Promise<CascadeNode[]> {
  if (depth > 10) return [];

  const children: CascadeNode[] = [];

  const taskEvents = await prisma.taskEvent.findMany({
    where: { triggeredBy: triggeredById },
    include: {
      task: { select: { id: true, title: true, userId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const event of taskEvents) {
    if (event.task.userId !== userId) continue;
    const grandchildren = await findTriggeredEvents(
      prisma,
      event.id,
      userId,
      depth + 1
    );
    children.push({
      id: event.task.id,
      type: "task",
      title: event.task.title,
      eventType: event.eventType,
      timestamp: event.createdAt.toISOString(),
      children: grandchildren,
    });
  }

  const projectEvents = await prisma.projectEvent.findMany({
    where: { triggeredBy: triggeredById },
    include: {
      project: {
        select: { id: true, title: true, userId: true, goalId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const event of projectEvents) {
    if (event.project.userId !== userId) continue;
    const grandchildren = await findTriggeredEvents(
      prisma,
      event.id,
      userId,
      depth + 1
    );

    if (event.eventType === "COMPLETED" && event.project.goalId) {
      const goal = await prisma.goal.findUnique({
        where: { id: event.project.goalId },
        select: { id: true, title: true },
      });
      if (goal) {
        grandchildren.push({
          id: goal.id,
          type: "goal",
          title: goal.title,
          eventType: "PROGRESS_UPDATED",
          timestamp: event.createdAt.toISOString(),
          children: [],
        });
      }
    }

    children.push({
      id: event.project.id,
      type: "project",
      title: event.project.title,
      eventType: event.eventType,
      timestamp: event.createdAt.toISOString(),
      children: grandchildren,
    });
  }

  return children;
}

function formatCascadeTree(
  nodes: CascadeNode[],
  indent: string = ""
): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    const typeLabel =
      node.type === "task"
        ? "Task"
        : node.type === "project"
          ? "Project"
          : "Goal";
    lines.push(
      `${indent}${typeLabel}: "${node.title}" — ${node.eventType}`
    );
    if (node.children.length > 0) {
      lines.push(...formatCascadeTree(node.children, indent + "  "));
    }
  }
  return lines;
}

function countCascadeSummary(children: CascadeNode[]): {
  tasksPromoted: number;
  projectsCompleted: number;
  goalsUpdated: number;
} {
  let tasksPromoted = 0;
  let projectsCompleted = 0;
  let goalsUpdated = 0;

  for (const child of children) {
    if (child.type === "task" && child.eventType === "PROMOTED")
      tasksPromoted++;
    if (child.type === "project" && child.eventType === "COMPLETED")
      projectsCompleted++;
    if (child.type === "goal") goalsUpdated++;

    const sub = countCascadeSummary(child.children);
    tasksPromoted += sub.tasksPromoted;
    projectsCompleted += sub.projectsCompleted;
    goalsUpdated += sub.goalsUpdated;
  }

  return { tasksPromoted, projectsCompleted, goalsUpdated };
}

async function handleCascadeTrace(args: {
  taskId: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  const task = await prisma.task.findFirst({
    where: { id: args.taskId, userId },
    select: { id: true, title: true },
  });
  if (!task) {
    return JSON.stringify({ error: "Task not found" });
  }

  const completionEvent = await prisma.taskEvent.findFirst({
    where: { taskId: args.taskId, eventType: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });

  if (!completionEvent) {
    return `No completion event found for task "${task.title}". The task must be completed to trace its cascade.`;
  }

  const children = await findTriggeredEvents(
    prisma,
    completionEvent.id,
    userId
  );

  if (children.length === 0) {
    return `Task "${task.title}" was completed but did not trigger any cascade events.`;
  }

  const summary = countCascadeSummary(children);
  const lines: string[] = [];

  lines.push(`Cascade trace for "${task.title}":`);
  lines.push(`  Completed ${formatRelativeTime(completionEvent.createdAt.toISOString())}`);
  lines.push("");
  lines.push("Triggered:");
  lines.push(...formatCascadeTree(children, "  "));
  lines.push("");
  lines.push(
    `Summary: ${summary.tasksPromoted} task(s) promoted, ${summary.projectsCompleted} project(s) completed, ${summary.goalsUpdated} goal(s) updated`
  );

  return lines.join("\n");
}

const REVERT_SNAPSHOT_FIELDS = [
  "title",
  "notes",
  "status",
  "energyLevel",
  "estimatedMins",
  "contextId",
  "projectId",
  "scheduledDate",
  "dueDate",
  "isNextAction",
  "isMilestone",
  "percentComplete",
] as const;

async function handleTaskRevert(args: {
  taskId: string;
  snapshotId: string;
  message?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // Load snapshot with task
  const snapshot = await prisma.taskSnapshot.findUnique({
    where: { id: args.snapshotId },
    include: {
      task: true,
    },
  });

  if (!snapshot) {
    return JSON.stringify({ error: "Snapshot not found" });
  }

  if (snapshot.task.userId !== userId) {
    return JSON.stringify({ error: "Unauthorized" });
  }

  if (snapshot.taskId !== args.taskId) {
    return JSON.stringify({ error: "Snapshot does not belong to this task" });
  }

  const snapshotState = snapshot.state as Record<string, unknown>;

  // Extract current state for comparison
  const currentState: Record<string, unknown> = {};
  const taskRecord = snapshot.task as unknown as Record<string, unknown>;
  for (const field of REVERT_SNAPSHOT_FIELDS) {
    const value = taskRecord[field];
    currentState[field] =
      value instanceof Date ? value.toISOString() : (value ?? null);
  }

  const changes = computeDiff(currentState, snapshotState);

  if (Object.keys(changes).length === 0) {
    return JSON.stringify({
      error: "No changes to revert — task already matches snapshot",
    });
  }

  // Build update data from snapshot state
  const updateData: Record<string, unknown> = {};
  for (const field of REVERT_SNAPSHOT_FIELDS) {
    const value = snapshotState[field];
    if (
      (field === "scheduledDate" || field === "dueDate") &&
      typeof value === "string"
    ) {
      updateData[field] = new Date(value);
    } else {
      updateData[field] = value;
    }
  }

  // Apply in transaction (always increment version on revert)
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: args.taskId },
      data: { ...updateData, version: { increment: 1 } },
    });

    // Infer event type
    let eventType: TaskEventType = "UPDATED";
    if ("status" in changes) {
      const newStatus = changes.status.new;
      if (newStatus === "COMPLETED") eventType = "COMPLETED";
      else if (changes.status.old === "COMPLETED") eventType = "REOPENED";
      else eventType = "STATUS_CHANGED";
    }

    const event = await tx.taskEvent.create({
      data: {
        taskId: args.taskId,
        eventType,
        actorType: "AI",
        actorId: userId,
        changes: changes as unknown as Prisma.InputJsonValue,
        message:
          args.message ??
          `Reverted to snapshot from ${new Date(snapshot.createdAt).toLocaleString()}`,
        source: "MCP",
      },
    });

    // Take a new snapshot at the revert point
    const updatedTask = await tx.task.findUniqueOrThrow({
      where: { id: args.taskId },
    });

    const newState: Record<string, unknown> = {};
    const updatedRecord = updatedTask as unknown as Record<string, unknown>;
    for (const field of REVERT_SNAPSHOT_FIELDS) {
      const val = updatedRecord[field];
      newState[field] =
        val instanceof Date ? val.toISOString() : (val ?? null);
    }
    newState.predecessorIds = [];

    await tx.taskSnapshot.create({
      data: {
        taskId: args.taskId,
        state: newState as unknown as Prisma.InputJsonValue,
        reason: "REVERT_POINT",
        eventId: event.id,
      },
    });
  });

  // Format what changed
  const changeLines = Object.entries(changes).map(([field, change]) =>
    formatFieldChange(field, change.old, change.new)
  );

  return JSON.stringify(
    {
      success: true,
      taskId: args.taskId,
      snapshotId: args.snapshotId,
      changes: changeLines,
      message: `Reverted task to snapshot state. ${changeLines.length} field(s) changed.`,
    },
    null,
    2
  );
}

async function handleProjectCreateFromTemplate(args: {
  templateId?: string;
  variables?: Record<string, string>;
  projectTitle?: string;
  areaId?: string;
  goalId?: string;
  teamId?: string;
}): Promise<string> {
  const prisma = getPrisma();
  const userId = getUserId();

  // If no templateId, list available templates
  if (!args.templateId) {
    const templates = await prisma.projectTemplate.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        variables: true,
        isSystem: true,
        _count: { select: { taskTemplates: true, subProjectTemplates: true } },
      },
      orderBy: [{ isSystem: "desc" }, { title: "asc" }],
    });

    return JSON.stringify(
      {
        message:
          "No templateId provided. Here are the available templates. Call again with a templateId to create a project.",
        templates,
      },
      null,
      2
    );
  }

  // Import and use the service function
  const { instantiateTemplate } = await import(
    "@/lib/services/template-service"
  );

  try {
    const project = await instantiateTemplate({
      templateId: args.templateId,
      userId,
      variables: args.variables || {},
      projectTitle: args.projectTitle,
      areaId: args.areaId,
      goalId: args.goalId,
      teamId: args.teamId,
      actor: { actorType: "AI", actorId: userId, source: "MCP" },
    });

    return JSON.stringify(
      {
        success: true,
        message: `Created project "${project.title}" (ID: ${project.id}) from template.`,
        project: {
          id: project.id,
          title: project.title,
          type: project.type,
          status: project.status,
        },
      },
      null,
      2
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to instantiate template";
    return JSON.stringify({ error: message });
  }
}

// =============================================================================
// Registration
// =============================================================================

export function registerTools(server: Server): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case "tandem_inbox_add":
          result = await handleInboxAdd(args as Parameters<typeof handleInboxAdd>[0]);
          break;
        case "tandem_inbox_list":
          result = await handleInboxList(args as Parameters<typeof handleInboxList>[0]);
          break;
        case "tandem_task_create":
          result = await handleTaskCreate(args as Parameters<typeof handleTaskCreate>[0]);
          break;
        case "tandem_task_complete":
          result = await handleTaskComplete(
            args as Parameters<typeof handleTaskComplete>[0]
          );
          break;
        case "tandem_task_list":
          result = await handleTaskList(args as Parameters<typeof handleTaskList>[0]);
          break;
        case "tandem_what_now":
          result = await handleWhatNow(args as Parameters<typeof handleWhatNow>[0]);
          break;
        case "tandem_project_list":
          result = await handleProjectList(
            args as Parameters<typeof handleProjectList>[0]
          );
          break;
        case "tandem_project_create":
          result = await handleProjectCreate(
            args as Parameters<typeof handleProjectCreate>[0]
          );
          break;
        case "tandem_search":
          result = await handleSearch(args as Parameters<typeof handleSearch>[0]);
          break;
        case "tandem_waiting_for_list":
          result = await handleWaitingForList(
            args as Parameters<typeof handleWaitingForList>[0]
          );
          break;
        case "tandem_review_status":
          result = await handleReviewStatus();
          break;
        case "tandem_horizon_note_list":
          result = await handleHorizonNoteList(
            args as Parameters<typeof handleHorizonNoteList>[0]
          );
          break;
        case "tandem_horizon_note_upsert":
          result = await handleHorizonNoteUpsert(
            args as Parameters<typeof handleHorizonNoteUpsert>[0]
          );
          break;
        case "tandem_goal_list":
          result = await handleGoalList(
            args as Parameters<typeof handleGoalList>[0]
          );
          break;
        case "tandem_goal_create":
          result = await handleGoalCreate(
            args as Parameters<typeof handleGoalCreate>[0]
          );
          break;
        case "tandem_goal_update":
          result = await handleGoalUpdate(
            args as Parameters<typeof handleGoalUpdate>[0]
          );
          break;
        case "tandem_area_list":
          result = await handleAreaList(
            args as Parameters<typeof handleAreaList>[0]
          );
          break;
        case "tandem_area_create":
          result = await handleAreaCreate(
            args as Parameters<typeof handleAreaCreate>[0]
          );
          break;
        case "tandem_horizon_review_status":
          result = await handleHorizonReviewStatus();
          break;
        // Team management tools
        case "tandem_team_list":
          result = await handleTeamList();
          break;
        case "tandem_team_create":
          result = await handleTeamCreate(
            args as Parameters<typeof handleTeamCreate>[0]
          );
          break;
        case "tandem_team_members":
          result = await handleTeamMembers(
            args as Parameters<typeof handleTeamMembers>[0]
          );
          break;
        case "tandem_team_add_member":
          result = await handleTeamAddMember(
            args as Parameters<typeof handleTeamAddMember>[0]
          );
          break;
        case "tandem_team_remove_member":
          result = await handleTeamRemoveMember(
            args as Parameters<typeof handleTeamRemoveMember>[0]
          );
          break;
        case "tandem_task_assign":
          result = await handleTaskAssign(
            args as Parameters<typeof handleTaskAssign>[0]
          );
          break;
        case "tandem_task_update":
          result = await handleTaskUpdate(
            args as Parameters<typeof handleTaskUpdate>[0]
          );
          break;
        case "tandem_task_bulk_update":
          result = await handleTaskBulkUpdate(
            args as Parameters<typeof handleTaskBulkUpdate>[0]
          );
          break;
        case "tandem_task_delete":
          result = await handleTaskDelete(
            args as Parameters<typeof handleTaskDelete>[0]
          );
          break;
        case "tandem_inbox_update":
          result = await handleInboxUpdate(
            args as Parameters<typeof handleInboxUpdate>[0]
          );
          break;
        case "tandem_inbox_delete":
          result = await handleInboxDelete(
            args as Parameters<typeof handleInboxDelete>[0]
          );
          break;
        // Wiki tools
        case "tandem_wiki_search":
          result = await handleWikiSearch(
            args as Parameters<typeof handleWikiSearch>[0]
          );
          break;
        case "tandem_wiki_read":
          result = await handleWikiRead(
            args as Parameters<typeof handleWikiRead>[0]
          );
          break;
        case "tandem_wiki_create":
          result = await handleWikiCreate(
            args as Parameters<typeof handleWikiCreate>[0]
          );
          break;
        case "tandem_wiki_update":
          result = await handleWikiUpdate(
            args as Parameters<typeof handleWikiUpdate>[0]
          );
          break;
        case "tandem_wiki_delete":
          result = await handleWikiDelete(
            args as Parameters<typeof handleWikiDelete>[0]
          );
          break;
        case "tandem_wiki_history":
          result = await handleWikiHistory(
            args as Parameters<typeof handleWikiHistory>[0]
          );
          break;
        case "tandem_wiki_backlinks":
          result = await handleWikiBacklinks(
            args as Parameters<typeof handleWikiBacklinks>[0]
          );
          break;
        case "tandem_task_create_from_text":
          result = await handleTaskCreateFromText(
            args as Parameters<typeof handleTaskCreateFromText>[0]
          );
          break;
        // History tools
        case "tandem_task_history":
          result = await handleTaskHistory(
            args as Parameters<typeof handleTaskHistory>[0]
          );
          break;
        case "tandem_activity_feed":
          result = await handleActivityFeed(
            args as Parameters<typeof handleActivityFeed>[0]
          );
          break;
        case "tandem_weekly_summary":
          result = await handleWeeklySummary(
            args as Parameters<typeof handleWeeklySummary>[0]
          );
          break;
        case "tandem_cascade_trace":
          result = await handleCascadeTrace(
            args as Parameters<typeof handleCascadeTrace>[0]
          );
          break;
        case "tandem_task_revert":
          result = await handleTaskRevert(
            args as Parameters<typeof handleTaskRevert>[0]
          );
          break;
        case "tandem_project_create_from_template":
          result = await handleProjectCreateFromTemplate(
            args as Parameters<typeof handleProjectCreateFromTemplate>[0]
          );
          break;
        default:
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }

      return {
        content: [{ type: "text" as const, text: result }],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });
}
