import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

// ============================================================================
// Types
// ============================================================================

interface CascadeTraceNode {
  id: string;
  type: "task" | "project" | "goal";
  title: string;
  eventType: string;
  timestamp: string;
  children: CascadeTraceNode[];
}

interface CascadeTrace {
  root: {
    id: string;
    type: "task";
    title: string;
    eventType: "COMPLETED";
    timestamp: string;
  };
  children: CascadeTraceNode[];
  summary: {
    tasksPromoted: number;
    projectsCompleted: number;
    goalsUpdated: number;
  };
}

// ============================================================================
// Helper: Recursively find events triggered by a given event ID
// ============================================================================

async function findTriggeredEvents(
  triggeredById: string,
  userId: string,
  depth: number = 0
): Promise<CascadeTraceNode[]> {
  // Guard against infinite recursion
  if (depth > 10) return [];

  const children: CascadeTraceNode[] = [];

  // Find task events triggered by this event
  const taskEvents = await prisma.taskEvent.findMany({
    where: { triggeredBy: triggeredById },
    include: {
      task: {
        select: { id: true, title: true, userId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const event of taskEvents) {
    // Only include events for tasks owned by this user
    if (event.task.userId !== userId) continue;

    const grandchildren = await findTriggeredEvents(event.id, userId, depth + 1);

    children.push({
      id: event.task.id,
      type: "task",
      title: event.task.title,
      eventType: event.eventType,
      timestamp: event.createdAt.toISOString(),
      children: grandchildren,
    });
  }

  // Find project events triggered by this event
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

    const grandchildren = await findTriggeredEvents(event.id, userId, depth + 1);

    // If this project completion also triggered a goal update, look for it
    // Goal updates are tracked as project changes with goal progress info
    if (event.eventType === "COMPLETED" && event.project.goalId) {
      const goal = await prisma.goal.findUnique({
        where: { id: event.project.goalId },
        select: { id: true, title: true, progress: true },
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

// ============================================================================
// Helper: Count cascade summary from tree
// ============================================================================

function countSummary(
  children: CascadeTraceNode[]
): CascadeTrace["summary"] {
  let tasksPromoted = 0;
  let projectsCompleted = 0;
  let goalsUpdated = 0;

  for (const child of children) {
    if (child.type === "task" && child.eventType === "PROMOTED") {
      tasksPromoted++;
    }
    if (child.type === "project" && child.eventType === "COMPLETED") {
      projectsCompleted++;
    }
    if (child.type === "goal") {
      goalsUpdated++;
    }

    // Recurse into children
    const sub = countSummary(child.children);
    tasksPromoted += sub.tasksPromoted;
    projectsCompleted += sub.projectsCompleted;
    goalsUpdated += sub.goalsUpdated;
  }

  return { tasksPromoted, projectsCompleted, goalsUpdated };
}

// ============================================================================
// GET /api/tasks/[id]/cascade-trace
// ============================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify task belongs to user
  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
    select: { id: true, title: true, status: true },
  });
  if (!task) return notFound("Task not found");

  // Find the COMPLETED event for this task (most recent)
  const completionEvent = await prisma.taskEvent.findFirst({
    where: {
      taskId: params.id,
      eventType: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!completionEvent) {
    return notFound("No completion event found for this task");
  }

  // Recursively find all cascade events triggered by this completion
  const children = await findTriggeredEvents(completionEvent.id, userId);

  const trace: CascadeTrace = {
    root: {
      id: task.id,
      type: "task",
      title: task.title,
      eventType: "COMPLETED",
      timestamp: completionEvent.createdAt.toISOString(),
    },
    children,
    summary: countSummary(children),
  };

  return NextResponse.json(trace);
}
