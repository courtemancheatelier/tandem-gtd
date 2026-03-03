import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateRecurringTemplateSchema } from "@/lib/validations/recurring";
import { getNextOccurrence, generateTaskFromTemplate } from "@/lib/recurring";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const template = await prisma.recurringTemplate.findFirst({
    where: { id: params.id, userId },
  });
  if (!template) return notFound("Recurring template not found");

  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.recurringTemplate.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Recurring template not found");

  const body = await req.json();
  const parsed = updateRecurringTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.taskDefaults !== undefined) data.taskDefaults = parsed.data.taskDefaults;

  if (parsed.data.color !== undefined) data.color = parsed.data.color;
  if (parsed.data.estimatedMins !== undefined) data.estimatedMins = parsed.data.estimatedMins;
  if (parsed.data.areaId !== undefined) data.areaId = parsed.data.areaId;
  if (parsed.data.goalId !== undefined) data.goalId = parsed.data.goalId;

  if (parsed.data.cronExpression !== undefined) {
    data.cronExpression = parsed.data.cronExpression;
    // Recalculate nextDue when schedule changes
    data.nextDue = getNextOccurrence(parsed.data.cronExpression, new Date());
  }

  if (parsed.data.nextDue !== undefined) {
    data.nextDue = parsed.data.nextDue ? new Date(parsed.data.nextDue) : null;
  }

  const template = await prisma.recurringTemplate.update({
    where: { id: params.id },
    data,
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  // When reactivating a template, generate a task if none exists
  const reactivated = !existing.isActive && parsed.data.isActive === true;
  if (reactivated) {
    const hasActiveTask = await prisma.task.findFirst({
      where: {
        recurringTemplateId: template.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });

    if (!hasActiveTask) {
      const now = new Date();

      await generateTaskFromTemplate({
        id: template.id,
        userId,
        title: template.title,
        description: template.description,
        cronExpression: template.cronExpression,
        taskDefaults: template.taskDefaults as { projectId?: string | null; contextId?: string | null; energyLevel?: "LOW" | "MEDIUM" | "HIGH" | null; estimatedMins?: number | null } | null,
        nextDue: now,
        isActive: true,
        lastGenerated: template.lastGenerated,
      });

      await prisma.recurringTemplate.update({
        where: { id: template.id },
        data: {
          lastGenerated: now,
          nextDue: getNextOccurrence(template.cronExpression, now),
        },
      });
    }
  }

  return NextResponse.json(template);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.recurringTemplate.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Recurring template not found");

  await prisma.recurringTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
