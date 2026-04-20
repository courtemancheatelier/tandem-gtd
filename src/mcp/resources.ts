/**
 * MCP Resource Definitions for Tandem GTD
 *
 * Resources provide read-only data that AI assistants can reference.
 * These are URI-addressable pieces of content the model can request.
 *
 * Resources:
 *   tandem://gtd-summary    - Current GTD system summary (counts, recent activity)
 *   tandem://projects/{id}  - Project details with all tasks (team-aware)
 *   tandem://contexts       - List of all contexts
 *   tandem://horizons       - Full horizons summary (notes, goals, areas, review status)
 *   tandem://teams          - User's teams with members, projects, and role
 *   tandem://wiki           - Index of all accessible wiki articles
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getPrisma, getUserId } from "./prisma-client";

export function registerResources(server: Server): void {
  // NOTE: Do NOT call getPrisma() here at registration time.
  // In HTTP transport mode, registerResources() runs during createSession()
  // which is OUTSIDE runWithContext(). getPrisma() must be called lazily
  // inside request handlers where AsyncLocalStorage context is active.

  // ---------------------------------------------------------------------------
  // List static resources
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "tandem://gtd-summary",
          name: "GTD System Summary",
          description:
            "Overview of the GTD system: task counts by status, project counts, inbox items, and recent activity.",
          mimeType: "application/json",
        },
        {
          uri: "tandem://contexts",
          name: "All Contexts",
          description:
            "List of all GTD contexts (e.g. @home, @office, @phone) with task counts.",
          mimeType: "application/json",
        },
        {
          uri: "tandem://horizons",
          name: "Horizons Summary",
          description:
            "Full summary of all horizons data: horizon notes (purpose, vision), active goals with progress, active areas with counts, and horizon review status.",
          mimeType: "application/json",
        },
        {
          uri: "tandem://teams",
          name: "Teams Summary",
          description:
            "User's teams with members, active projects, and role information.",
          mimeType: "application/json",
        },
        {
          uri: "tandem://wiki",
          name: "Wiki Index",
          description:
            "Index of all accessible wiki articles (personal + team) with slugs, titles, tags, and last updated. Includes aggregated tags list.",
          mimeType: "application/json",
        },
      ],
    };
  });

  // ---------------------------------------------------------------------------
  // List resource templates (parameterized resources)
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: "tandem://projects/{id}",
          name: "Project Details",
          description:
            "Full project details including all tasks, status, and progress.",
          mimeType: "application/json",
        },
      ],
    };
  });

  // ---------------------------------------------------------------------------
  // Read a specific resource
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const prisma = getPrisma();
    const userId = getUserId();

    // --- tandem://gtd-summary ---
    if (uri === "tandem://gtd-summary") {
      const [
        taskCounts,
        projectCounts,
        inboxCount,
        waitingForCount,
        nextActions,
        recentCompletions,
        latestReview,
      ] = await Promise.all([
        // Task counts by status
        prisma.task.groupBy({
          by: ["status"],
          where: { userId },
          _count: { id: true },
        }),
        // Project counts by status
        prisma.project.groupBy({
          by: ["status"],
          where: { userId },
          _count: { id: true },
        }),
        // Unprocessed inbox items
        prisma.inboxItem.count({
          where: { userId, status: "UNPROCESSED" },
        }),
        // Unresolved waiting-for items
        prisma.waitingFor.count({
          where: { userId, isResolved: false },
        }),
        // Current next actions count
        prisma.task.count({
          where: {
            userId,
            isNextAction: true,
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          },
        }),
        // Tasks completed in last 7 days
        prisma.task.count({
          where: {
            userId,
            status: "COMPLETED",
            completedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        // Latest weekly review
        prisma.weeklyReview.findFirst({
          where: { userId },
          orderBy: { weekOf: "desc" },
          select: { id: true, status: true, weekOf: true, completedAt: true },
        }),
      ]);

      const tasksByStatus: Record<string, number> = {};
      for (const row of taskCounts) {
        tasksByStatus[row.status] = row._count.id;
      }

      const projectsByStatus: Record<string, number> = {};
      for (const row of projectCounts) {
        projectsByStatus[row.status] = row._count.id;
      }

      const summary = {
        timestamp: new Date().toISOString(),
        tasks: {
          byStatus: tasksByStatus,
          nextActionsAvailable: nextActions,
          completedLast7Days: recentCompletions,
        },
        projects: {
          byStatus: projectsByStatus,
        },
        inbox: {
          unprocessed: inboxCount,
        },
        waitingFor: {
          unresolved: waitingForCount,
        },
        weeklyReview: latestReview
          ? {
              status: latestReview.status,
              weekOf: latestReview.weekOf.toISOString(),
              completedAt: latestReview.completedAt?.toISOString() ?? null,
            }
          : null,
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }

    // --- tandem://contexts ---
    if (uri === "tandem://contexts") {
      const contexts = await prisma.context.findMany({
        where: { userId },
        orderBy: { sortOrder: "asc" },
        include: {
          _count: {
            select: {
              tasks: {
                where: {
                  status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
                },
              },
            },
          },
        },
      });

      const data = contexts.map((ctx) => ({
        id: ctx.id,
        name: ctx.name,
        color: ctx.color,
        icon: ctx.icon,
        activeTaskCount: ctx._count.tasks,
      }));

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // --- tandem://horizons ---
    if (uri === "tandem://horizons") {
      const [notes, goals, areas, latestReview, currentInProgress] =
        await Promise.all([
          prisma.horizonNote.findMany({
            where: { userId },
            orderBy: { level: "desc" },
          }),
          prisma.goal.findMany({
            where: { userId, status: { not: "DEFERRED" } },
            orderBy: { createdAt: "desc" },
            include: {
              area: { select: { id: true, name: true } },
              _count: { select: { projects: true } },
            },
          }),
          prisma.area.findMany({
            where: { userId, isActive: true },
            orderBy: { sortOrder: "asc" },
            include: {
              _count: { select: { projects: true, goals: true } },
            },
          }),
          prisma.horizonReview.findFirst({
            where: { userId, status: "COMPLETED" },
            orderBy: { completedAt: "desc" },
          }),
          prisma.horizonReview.findFirst({
            where: { userId, status: "IN_PROGRESS" },
            orderBy: { createdAt: "desc" },
          }),
        ]);

      const now = new Date();
      const daysSinceReview = latestReview?.completedAt
        ? Math.floor(
            (now.getTime() - latestReview.completedAt.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      const data = {
        timestamp: new Date().toISOString(),
        horizonNotes: notes.map((n) => ({
          id: n.id,
          level: n.level,
          title: n.title,
          content: n.content,
          updatedAt: n.updatedAt.toISOString(),
        })),
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
        })),
        areas: areas.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          isActive: a.isActive,
          projectCount: a._count.projects,
          goalCount: a._count.goals,
        })),
        reviewStatus: {
          lastReviewDate: latestReview?.completedAt?.toISOString() ?? null,
          lastReviewType: latestReview?.type ?? null,
          daysSinceReview,
          isOverdue: daysSinceReview === null || daysSinceReview > 90,
          currentInProgress: currentInProgress
            ? { id: currentInProgress.id, type: currentInProgress.type }
            : null,
        },
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // --- tandem://teams ---
    if (uri === "tandem://teams") {
      const memberships = await prisma.teamMember.findMany({
        where: { userId },
        include: {
          team: {
            include: {
              members: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
                orderBy: { joinedAt: "asc" },
              },
              projects: {
                where: { status: "ACTIVE" },
                select: { id: true, title: true, type: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      });

      const data = {
        timestamp: new Date().toISOString(),
        teams: memberships.map((m) => ({
          id: m.team.id,
          name: m.team.name,
          description: m.team.description,
          myRole: m.role,
          members: m.team.members.map((mem) => ({
            userId: mem.user.id,
            name: mem.user.name,
            email: mem.user.email,
            role: mem.role,
            label: mem.label,
          })),
          activeProjects: m.team.projects.map((p) => ({
            id: p.id,
            title: p.title,
            type: p.type,
          })),
        })),
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // --- tandem://wiki ---
    if (uri === "tandem://wiki") {
      // Get team IDs inline (no shared helper import)
      const teamMemberships = await prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      const teamIds = teamMemberships.map((m) => m.teamId);

      const scopeFilter =
        teamIds.length > 0
          ? {
              OR: [
                { userId, teamId: null },
                { teamId: { in: teamIds } },
              ],
            }
          : { userId, teamId: null };

      const articles = await prisma.wikiArticle.findMany({
        where: scopeFilter,
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          slug: true,
          title: true,
          tags: true,
          teamId: true,
          updatedAt: true,
        },
      });

      // Aggregate all unique tags
      const allTags = new Set<string>();
      for (const a of articles) {
        for (const tag of a.tags) {
          allTags.add(tag);
        }
      }

      const data = {
        timestamp: new Date().toISOString(),
        articles: articles.map((a) => ({
          slug: a.slug,
          title: a.title,
          tags: a.tags,
          teamId: a.teamId,
          updatedAt: a.updatedAt.toISOString(),
        })),
        allTags: Array.from(allTags).sort(),
        total: articles.length,
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // --- tandem://projects/{id} ---
    const projectMatch = uri.match(/^tandem:\/\/projects\/(.+)$/);
    if (projectMatch) {
      const projectId = projectMatch[1];

      // Team-aware: user owns it OR it belongs to a team they're in
      const teamMemberships = await prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      const teamIds = teamMemberships.map((m) => m.teamId);

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { userId },
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
          ],
        },
        include: {
          area: { select: { id: true, name: true } },
          goal: { select: { id: true, title: true } },
          team: { select: { id: true, name: true } },
          tasks: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              isNextAction: true,
              energyLevel: true,
              estimatedMins: true,
              scheduledDate: true,
              dueDate: true,
              context: { select: { id: true, name: true } },
              assignedTo: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter(
        (t) => t.status === "COMPLETED"
      ).length;

      const data = {
        id: project.id,
        title: project.title,
        description: project.description,
        status: project.status,
        type: project.type,
        outcome: project.outcome,
        area: project.area,
        goal: project.goal,
        team: project.team,
        progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        tasks: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          isNextAction: t.isNextAction,
          energyLevel: t.energyLevel,
          estimatedMins: t.estimatedMins,
          scheduledDate: t.scheduledDate?.toISOString() ?? null,
          dueDate: t.dueDate?.toISOString() ?? null,
          context: t.context,
          assignedTo: t.assignedTo,
        })),
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });
}
