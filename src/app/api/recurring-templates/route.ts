import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createRecurringTemplateSchema } from "@/lib/validations/recurring";
import { getNextOccurrence, generateTaskFromTemplate } from "@/lib/recurring";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const templates = await prisma.recurringTemplate.findMany({
    where: { userId },
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createRecurringTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { title, description, cronExpression, nextDue, isActive, color, estimatedMins, areaId, goalId, taskDefaults } = parsed.data;

  // Calculate nextDue if not provided
  const computedNextDue = nextDue
    ? new Date(nextDue)
    : getNextOccurrence(cronExpression, new Date());

  const template = await prisma.recurringTemplate.create({
    data: {
      title,
      description: description || null,
      cronExpression,
      nextDue: computedNextDue,
      isActive: isActive ?? true,
      color: color || null,
      estimatedMins: estimatedMins ?? null,
      areaId: areaId || null,
      goalId: goalId || null,
      taskDefaults: taskDefaults ?? undefined,
      userId,
    },
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  // Generate the first task immediately scheduled for today so
  // it appears in the Card File right away.
  if (template.isActive) {
    const now = new Date();

    await generateTaskFromTemplate({
      id: template.id,
      userId,
      title,
      description: description || null,
      cronExpression,
      taskDefaults: taskDefaults as Record<string, unknown> | null ?? null,
      nextDue: now,
      isActive: true,
      lastGenerated: null,
    });

    await prisma.recurringTemplate.update({
      where: { id: template.id },
      data: { lastGenerated: now },
    });
  }

  return NextResponse.json(template, { status: 201 });
}
