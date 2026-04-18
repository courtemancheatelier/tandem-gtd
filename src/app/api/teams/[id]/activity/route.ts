import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { isTeamMember } from "@/lib/services/team-permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  if (!(await isTeamMember(userId, params.id))) {
    return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const before = searchParams.get("before");
  const actorId = searchParams.get("actorId");
  const category = searchParams.get("category"); // "threads" | "decisions" | "tasks" | "projects"
  const projectIdFilter = searchParams.get("projectId");

  // Get all project IDs for this team
  const teamProjects = await prisma.project.findMany({
    where: { teamId: params.id },
    select: { id: true, title: true },
  });
  const allProjectIds = teamProjects.map((p) => p.id);

  // If projectId filter is set, narrow to that single project (must belong to team)
  const projectIds = projectIdFilter && allProjectIds.includes(projectIdFilter)
    ? [projectIdFilter]
    : allProjectIds;
  const projectTitleMap = new Map(teamProjects.map((p) => [p.id, p.title]));

  if (projectIds.length === 0) {
    return NextResponse.json({ events: [], hasMore: false });
  }

  // Get task IDs for these projects (needed for task events)
  const teamTasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, title: true, projectId: true },
  });
  const taskIds = teamTasks.map((t) => t.id);
  const taskTitleMap = new Map(teamTasks.map((t) => [t.id, t.title]));
  const taskProjectMap = new Map(teamTasks.map((t) => [t.id, t.projectId]));

  // Build event type filters based on category
  const threadEventTypes = ["THREAD_OPENED", "THREAD_RESOLVED"];
  const decisionEventTypes = ["DECISION_REQUESTED", "DECISION_RESOLVED"];

  // Fetch project events + task events in parallel
  const dateFilter = before ? { lt: new Date(before) } : undefined;

  // Build where clauses
  const projectWhere: Record<string, unknown> = { projectId: { in: projectIds } };
  const taskWhere: Record<string, unknown> = { taskId: { in: taskIds } };

  if (dateFilter) {
    projectWhere.createdAt = dateFilter;
    taskWhere.createdAt = dateFilter;
  }
  if (actorId) {
    projectWhere.actorId = actorId;
    taskWhere.actorId = actorId;
  }

  // Category filtering
  if (category === "threads") {
    projectWhere.eventType = { in: threadEventTypes };
    taskWhere.eventType = { in: threadEventTypes };
  } else if (category === "decisions") {
    projectWhere.eventType = { in: decisionEventTypes };
    taskWhere.eventType = { in: decisionEventTypes };
  } else if (category === "tasks") {
    // Only task events, skip project events
    projectWhere.eventType = { in: [] }; // no project events
  } else if (category === "projects") {
    // Only project events, skip task events
    taskWhere.eventType = { in: [] }; // no task events
  }

  const [projectEvents, taskEvents] = await Promise.all([
    prisma.projectEvent.findMany({
      where: projectWhere,
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    taskIds.length > 0
      ? prisma.taskEvent.findMany({
          where: taskWhere,
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  // Format and merge
  const allEvents = [
    ...projectEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId,
      actorName: e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
      changes: e.changes as Record<string, { old: unknown; new: unknown }>,
      message: e.message,
      source: e.source,
      triggeredBy: e.triggeredBy,
      createdAt: e.createdAt.toISOString(),
      entityType: "project" as const,
      entityTitle: projectTitleMap.get(e.projectId) ?? "Project",
      projectId: e.projectId,
    })),
    ...taskEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId,
      actorName: e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
      changes: e.changes as Record<string, { old: unknown; new: unknown }>,
      message: e.message,
      source: e.source,
      triggeredBy: e.triggeredBy,
      createdAt: e.createdAt.toISOString(),
      entityType: "task" as const,
      entityTitle: taskTitleMap.get(e.taskId) ?? "Task",
      taskId: e.taskId,
      projectId: taskProjectMap.get(e.taskId),
    })),
  ];

  // Sort by date descending and trim
  allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const trimmed = allEvents.slice(0, limit);

  // Collect unique actors for filter dropdown
  const actorMap = new Map<string, string>();
  for (const e of allEvents) {
    if (e.actorId && e.actorName && e.actorName !== "System" && e.actorName !== "AI Assistant") {
      actorMap.set(e.actorId, e.actorName);
    }
  }
  const actors = Array.from(actorMap.entries()).map(([id, name]) => ({ id, name }));

  return NextResponse.json({
    events: trimmed,
    hasMore: allEvents.length > limit,
    actors,
    projects: teamProjects.map((p) => ({ id: p.id, title: p.title })),
  });
}
