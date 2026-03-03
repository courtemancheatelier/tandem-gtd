import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { TaskStatus, ProjectStatus } from "@prisma/client";

/**
 * "What Should I Do Now?" — the cross-project available tasks query.
 * Returns tasks that are:
 * - Next actions (isNextAction = true)
 * - Not completed or dropped
 * - In active projects (or standalone)
 * - Not scheduled for the future
 * - Optionally filtered by context, energy, time
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const contextId = searchParams.get("contextId");
  const maxMins = searchParams.get("maxMins");
  const energyLevel = searchParams.get("energyLevel");

  const now = new Date();

  const where: Record<string, unknown> = {
    userId,
    isNextAction: true,
    status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
    OR: [
      { scheduledDate: null },
      { scheduledDate: { lte: now } },
    ],
    // Only from active projects or standalone (no project)
    AND: [
      {
        OR: [
          { projectId: null },
          { project: { status: ProjectStatus.ACTIVE } },
        ],
      },
    ],
  };

  if (contextId) where.contextId = contextId;
  if (maxMins) where.estimatedMins = { lte: parseInt(maxMins) };
  if (energyLevel) where.energyLevel = energyLevel;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, title: true, type: true, team: { select: { id: true, name: true, icon: true } } } },
      context: { select: { id: true, name: true, color: true } },
    },
    orderBy: [
      { dueDate: "asc" },
      { sortOrder: "asc" },
    ],
  });

  // Also fetch waiting-for items and due-soon tasks
  const waitingFor = await prisma.waitingFor.findMany({
    where: { userId, isResolved: false },
    orderBy: { dueDate: "asc" },
    take: 10,
  });

  const dueSoon = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
      dueDate: {
        lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // Next 3 days
        gte: now,
      },
    },
    include: {
      project: { select: { id: true, title: true, team: { select: { id: true, name: true, icon: true } } } },
      context: { select: { id: true, name: true, color: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({
    doNow: tasks,
    waitingFor,
    dueSoon,
  });
}
