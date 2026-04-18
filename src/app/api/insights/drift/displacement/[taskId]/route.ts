import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driftDashboardEnabled: true, driftDisplacementEnabled: true },
  });
  if (!user?.driftDashboardEnabled || !user?.driftDisplacementEnabled) {
    return NextResponse.json({ error: "Displacement lens disabled" }, { status: 403 });
  }

  const { taskId } = await params;

  // Verify the task belongs to this user
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true, deferralCount: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Get all deferral events for this task
  const deferralEvents = await prisma.taskEvent.findMany({
    where: { taskId, eventType: "DEFERRED" },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // For each deferral day, find tasks completed that same calendar day
  const displacements = await Promise.all(
    deferralEvents.map(async (event) => {
      const dayStart = new Date(event.createdAt);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const completedTasks = await prisma.taskEvent.findMany({
        where: {
          eventType: "COMPLETED",
          createdAt: { gte: dayStart, lt: dayEnd },
          task: { userId, id: { not: taskId } },
        },
        select: {
          task: {
            select: {
              id: true,
              title: true,
              project: {
                select: {
                  area: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      return {
        deferralDate: event.createdAt.toISOString().slice(0, 10),
        completedTasks: completedTasks.map((ct) => ({
          id: ct.task.id,
          title: ct.task.title,
          area: ct.task.project?.area?.name ?? null,
        })),
      };
    })
  );

  return NextResponse.json({ displacements });
}
