import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";

const LIMIT_PER_TYPE = 5;

type SearchType = "all" | "tasks" | "projects" | "inbox" | "waiting" | "threads";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const type = (searchParams.get("type") || "all") as SearchType;

  if (!q || q.length === 0) {
    return badRequest("Search query is required");
  }

  const searchFilter = { contains: q, mode: "insensitive" as const };

  // Get team project IDs for thread search
  const teamIds = (type === "all" || type === "threads")
    ? await getUserTeamIds(userId)
    : [];
  const teamProjectIds = teamIds.length > 0
    ? (await prisma.project.findMany({ where: { teamId: { in: teamIds } }, select: { id: true } })).map((p) => p.id)
    : [];

  const [tasks, projects, inbox, waitingFor, threads] = await Promise.all([
    // Tasks
    type === "all" || type === "tasks"
      ? prisma.task.findMany({
          where: {
            userId,
            OR: [
              { title: searchFilter },
              { notes: searchFilter },
            ],
          },
          select: {
            id: true,
            title: true,
            status: true,
            isNextAction: true,
            projectId: true,
            project: { select: { title: true } },
            context: { select: { name: true } },
          },
          take: LIMIT_PER_TYPE,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),

    // Projects
    type === "all" || type === "projects"
      ? prisma.project.findMany({
          where: {
            userId,
            OR: [
              { title: searchFilter },
              { description: searchFilter },
              { outcome: searchFilter },
            ],
          },
          select: {
            id: true,
            title: true,
            status: true,
            _count: { select: { tasks: true } },
          },
          take: LIMIT_PER_TYPE,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),

    // Inbox
    type === "all" || type === "inbox"
      ? prisma.inboxItem.findMany({
          where: {
            userId,
            OR: [
              { content: searchFilter },
              { notes: searchFilter },
            ],
          },
          select: {
            id: true,
            content: true,
            status: true,
            createdAt: true,
          },
          take: LIMIT_PER_TYPE,
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),

    // Waiting For
    type === "all" || type === "waiting"
      ? prisma.waitingFor.findMany({
          where: {
            userId,
            OR: [
              { description: searchFilter },
              { person: searchFilter },
            ],
          },
          select: {
            id: true,
            description: true,
            person: true,
            isResolved: true,
          },
          take: LIMIT_PER_TYPE,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),

    // Threads (across user's team projects)
    (type === "all" || type === "threads") && teamProjectIds.length > 0
      ? prisma.thread.findMany({
          where: {
            OR: [
              { projectId: { in: teamProjectIds }, title: searchFilter },
              { projectId: { in: teamProjectIds }, messages: { some: { content: searchFilter } } },
              { task: { projectId: { in: teamProjectIds } }, title: searchFilter },
            ],
          },
          select: {
            id: true,
            title: true,
            purpose: true,
            isResolved: true,
            projectId: true,
            project: { select: { id: true, title: true } },
            task: { select: { projectId: true, project: { select: { id: true, title: true } } } },
          },
          take: LIMIT_PER_TYPE,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  // Format projects to include taskCount
  const formattedProjects = projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    taskCount: p._count.tasks,
  }));

  // Format tasks to include projectTitle and contextName
  const formattedTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    isNextAction: t.isNextAction,
    projectId: t.projectId,
    projectTitle: t.project?.title ?? null,
    contextName: t.context?.name ?? null,
  }));

  // Format threads to include resolved projectId
  const formattedThreads = threads.map((t) => ({
    id: t.id,
    title: t.title,
    purpose: t.purpose,
    isResolved: t.isResolved,
    projectId: t.projectId ?? t.task?.projectId ?? null,
    projectTitle: t.project?.title ?? t.task?.project?.title ?? null,
  }));

  const totalCount =
    formattedTasks.length +
    formattedProjects.length +
    inbox.length +
    waitingFor.length +
    formattedThreads.length;

  return NextResponse.json({
    tasks: formattedTasks,
    projects: formattedProjects,
    inbox,
    waitingFor,
    threads: formattedThreads,
    totalCount,
  });
}
