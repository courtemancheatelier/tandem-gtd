import { prisma } from "@/lib/prisma";

const RUNAWAY_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

interface ActiveSessionResult {
  id: string;
  taskId: string;
  taskTitle: string;
  startedAt: Date;
  pausedAt: Date | null;
  durationMin: number;
  isActive: boolean;
  elapsedMin: number;
  isRunaway: boolean;
}

function computeElapsed(session: {
  startedAt: Date;
  pausedAt: Date | null;
  durationMin: number;
}): number {
  if (session.pausedAt) {
    return session.durationMin;
  }
  const runningMs = Date.now() - session.startedAt.getTime();
  return session.durationMin + Math.floor(runningMs / 60000);
}

export async function getActiveSession(
  userId: string
): Promise<ActiveSessionResult | null> {
  const session = await prisma.taskTimerSession.findFirst({
    where: { userId, isActive: true, endedAt: null },
    include: { task: { select: { title: true } } },
  });

  if (!session) return null;

  const elapsedMin = computeElapsed(session);
  const isRunaway =
    !session.pausedAt &&
    Date.now() - session.startedAt.getTime() > RUNAWAY_THRESHOLD_MS;

  return {
    id: session.id,
    taskId: session.taskId,
    taskTitle: session.task.title,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    durationMin: session.durationMin,
    isActive: session.isActive,
    elapsedMin,
    isRunaway,
  };
}

export async function startTimer(userId: string, taskId: string) {
  // Verify the task belongs to the user (or user has team access)
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { userId },
        { project: { team: { members: { some: { userId } } } } },
      ],
    },
    select: { id: true, title: true },
  });

  if (!task) {
    throw new Error("Task not found or access denied");
  }

  // Auto-pause any existing running session
  let pausedSession: { id: string; taskId: string } | null = null;
  const existing = await prisma.taskTimerSession.findFirst({
    where: { userId, isActive: true, endedAt: null },
  });

  if (existing) {
    if (existing.taskId === taskId && !existing.pausedAt) {
      // Already running on this task — return it
      return {
        session: {
          id: existing.id,
          taskId: existing.taskId,
          taskTitle: task.title,
          startedAt: existing.startedAt,
          pausedAt: existing.pausedAt,
          durationMin: existing.durationMin,
          isActive: true,
        },
        pausedSession: null,
      };
    }

    // Pause/stop the existing session
    const runningMs = existing.pausedAt
      ? 0
      : Date.now() - existing.startedAt.getTime();
    const additionalMin = Math.floor(runningMs / 60000);

    await prisma.taskTimerSession.update({
      where: { id: existing.id },
      data: {
        pausedAt: new Date(),
        durationMin: existing.durationMin + additionalMin,
        endedAt: new Date(),
        isActive: false,
      },
    });

    pausedSession = { id: existing.id, taskId: existing.taskId };
  }

  // Create new session
  const newSession = await prisma.taskTimerSession.create({
    data: {
      taskId,
      userId,
      startedAt: new Date(),
      isActive: true,
    },
  });

  return {
    session: {
      id: newSession.id,
      taskId: newSession.taskId,
      taskTitle: task.title,
      startedAt: newSession.startedAt,
      pausedAt: null,
      durationMin: 0,
      isActive: true,
    },
    pausedSession,
  };
}

export async function pauseTimer(userId: string) {
  const session = await prisma.taskTimerSession.findFirst({
    where: { userId, isActive: true, endedAt: null, pausedAt: null },
    include: { task: { select: { title: true } } },
  });

  if (!session) {
    throw new Error("No running timer to pause");
  }

  const runningMs = Date.now() - session.startedAt.getTime();
  const additionalMin = Math.floor(runningMs / 60000);

  const updated = await prisma.taskTimerSession.update({
    where: { id: session.id },
    data: {
      pausedAt: new Date(),
      durationMin: session.durationMin + additionalMin,
    },
  });

  return {
    id: updated.id,
    taskId: updated.taskId,
    taskTitle: session.task.title,
    startedAt: updated.startedAt,
    pausedAt: updated.pausedAt,
    durationMin: updated.durationMin,
    isActive: true,
  };
}

export async function resumeTimer(userId: string) {
  const session = await prisma.taskTimerSession.findFirst({
    where: { userId, isActive: true, endedAt: null, pausedAt: { not: null } },
    include: { task: { select: { title: true } } },
  });

  if (!session) {
    throw new Error("No paused timer to resume");
  }

  const updated = await prisma.taskTimerSession.update({
    where: { id: session.id },
    data: {
      pausedAt: null,
      startedAt: new Date(), // Reset start to now; accumulated time is in durationMin
    },
  });

  return {
    id: updated.id,
    taskId: updated.taskId,
    taskTitle: session.task.title,
    startedAt: updated.startedAt,
    pausedAt: null,
    durationMin: updated.durationMin,
    isActive: true,
  };
}

export async function stopTimer(userId: string, adjustedMinutes?: number) {
  const session = await prisma.taskTimerSession.findFirst({
    where: { userId, isActive: true, endedAt: null },
    include: { task: { select: { title: true } } },
  });

  if (!session) {
    throw new Error("No active timer to stop");
  }

  let finalDuration: number;
  if (adjustedMinutes !== undefined) {
    finalDuration = adjustedMinutes;
  } else {
    const runningMs = session.pausedAt
      ? 0
      : Date.now() - session.startedAt.getTime();
    finalDuration = session.durationMin + Math.floor(runningMs / 60000);
  }

  const updated = await prisma.taskTimerSession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(),
      isActive: false,
      durationMin: finalDuration,
      pausedAt: session.pausedAt ?? new Date(),
    },
  });

  // Calculate total minutes across all sessions for this task
  const allSessions = await prisma.taskTimerSession.findMany({
    where: { taskId: session.taskId, userId, isActive: false, endedAt: { not: null } },
    select: { durationMin: true },
  });

  const totalTaskMinutes = allSessions.reduce(
    (sum, s) => sum + s.durationMin,
    0
  );

  return {
    session: {
      id: updated.id,
      taskId: updated.taskId,
      taskTitle: session.task.title,
      durationMin: updated.durationMin,
      isActive: false,
    },
    totalTaskMinutes,
  };
}

export async function discardTimer(userId: string) {
  const session = await prisma.taskTimerSession.findFirst({
    where: { userId, isActive: true, endedAt: null },
  });

  if (!session) {
    throw new Error("No active timer to discard");
  }

  await prisma.taskTimerSession.delete({
    where: { id: session.id },
  });

  return { discarded: true };
}

export async function getTaskSessions(userId: string, taskId: string) {
  const sessions = await prisma.taskTimerSession.findMany({
    where: { taskId, userId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      durationMin: true,
      isActive: true,
      pausedAt: true,
    },
  });

  const totalMinutes = sessions.reduce((sum, s) => {
    if (s.isActive) {
      return sum + computeElapsed(s);
    }
    return sum + s.durationMin;
  }, 0);

  return { sessions, totalMinutes };
}
