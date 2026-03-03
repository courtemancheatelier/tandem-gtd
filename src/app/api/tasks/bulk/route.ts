import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { bulkTaskUpdateSchema } from "@/lib/validations/bulk";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { writeTaskEvent } from "@/lib/history/event-writer";

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = bulkTaskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { taskIds, updates, versions } = parsed.data;

  // Fetch all requested tasks with ownership check
  const teamIds = await getUserTeamIds(userId);
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
    select: { id: true, version: true, contextId: true, energyLevel: true, estimatedMins: true, status: true, dueDate: true, assignedToId: true, projectId: true },
  });

  const accessibleIds = new Set(tasks.map((t) => t.id));
  const errors: string[] = [];
  const conflicted: string[] = [];

  for (const id of taskIds) {
    if (!accessibleIds.has(id)) {
      errors.push(`Task ${id} not found or not accessible`);
    }
  }

  // Build the Prisma data object from whichever fields are present
  const data: Record<string, unknown> = {};
  if (updates.contextId !== undefined) data.contextId = updates.contextId;
  if (updates.energyLevel !== undefined) data.energyLevel = updates.energyLevel;
  if (updates.estimatedMins !== undefined) data.estimatedMins = updates.estimatedMins;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
  if (updates.assignedToId !== undefined) data.assignedToId = updates.assignedToId;
  if (updates.projectId !== undefined) data.projectId = updates.projectId;

  let updated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const task of tasks) {
      // Version check if versions map is provided
      const expectedVersion = versions?.[task.id];
      if (expectedVersion !== undefined && task.version !== expectedVersion) {
        conflicted.push(task.id);
        continue;
      }

      // Skip if all values already match
      const alreadyMatches =
        (updates.contextId === undefined || task.contextId === updates.contextId) &&
        (updates.energyLevel === undefined || task.energyLevel === updates.energyLevel) &&
        (updates.estimatedMins === undefined || task.estimatedMins === updates.estimatedMins) &&
        (updates.status === undefined || task.status === updates.status) &&
        (updates.dueDate === undefined || task.dueDate?.toISOString() === updates.dueDate) &&
        (updates.assignedToId === undefined || task.assignedToId === updates.assignedToId) &&
        (updates.projectId === undefined || task.projectId === updates.projectId);

      if (alreadyMatches) {
        skipped++;
        continue;
      }

      await tx.task.update({
        where: { id: task.id },
        data: { ...data, version: { increment: 1 } },
      });

      // Build diff for history
      const diff: Record<string, { old: unknown; new: unknown }> = {};
      if (updates.contextId !== undefined && task.contextId !== updates.contextId) {
        diff.contextId = { old: task.contextId, new: updates.contextId };
      }
      if (updates.energyLevel !== undefined && task.energyLevel !== updates.energyLevel) {
        diff.energyLevel = { old: task.energyLevel, new: updates.energyLevel };
      }
      if (updates.estimatedMins !== undefined && task.estimatedMins !== updates.estimatedMins) {
        diff.estimatedMins = { old: task.estimatedMins, new: updates.estimatedMins };
      }
      if (updates.status !== undefined && task.status !== updates.status) {
        diff.status = { old: task.status, new: updates.status };
      }
      if (updates.dueDate !== undefined && task.dueDate?.toISOString() !== updates.dueDate) {
        diff.dueDate = { old: task.dueDate?.toISOString() ?? null, new: updates.dueDate };
      }
      if (updates.assignedToId !== undefined && task.assignedToId !== updates.assignedToId) {
        diff.assignedToId = { old: task.assignedToId, new: updates.assignedToId };
      }
      if (updates.projectId !== undefined && task.projectId !== updates.projectId) {
        diff.projectId = { old: task.projectId, new: updates.projectId };
      }

      await writeTaskEvent(
        tx,
        task.id,
        "UPDATED",
        diff,
        {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
          message: `Bulk update (${tasks.length} tasks)`,
        }
      );

      updated++;
    }
  });

  return NextResponse.json({ updated, skipped, conflicted, errors });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const { taskIds } = body;

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return badRequest("At least 1 task ID required");
  }
  if (taskIds.length > 100) {
    return badRequest("Maximum 100 tasks per batch");
  }

  const teamIds = await getUserTeamIds(userId);
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
    select: { id: true },
  });

  const accessibleIds = tasks.map((t) => t.id);

  if (accessibleIds.length === 0) {
    return badRequest("No accessible tasks found");
  }

  await prisma.task.deleteMany({
    where: { id: { in: accessibleIds } },
  });

  return NextResponse.json({
    deleted: accessibleIds.length,
    skipped: taskIds.length - accessibleIds.length,
  });
}
