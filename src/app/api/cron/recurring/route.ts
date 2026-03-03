import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTaskFromTemplate, getNextOccurrence } from "@/lib/recurring";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/recurring
 * Background scheduler: generates tasks from recurring templates whose nextDue <= now.
 * Runs across ALL users. Protected by CRON_SECRET bearer token.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const templates = await prisma.recurringTemplate.findMany({
    where: {
      isActive: true,
      nextDue: { lte: now },
    },
  });

  let generated = 0;
  let skipped = 0;

  for (const template of templates) {
    // Idempotency: skip if an active task already exists for this template
    const existingActive = await prisma.task.findFirst({
      where: {
        recurringTemplateId: template.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });

    if (existingActive) {
      skipped++;
      continue;
    }

    const nextDue = getNextOccurrence(template.cronExpression, now);

    await generateTaskFromTemplate({
      id: template.id,
      userId: template.userId,
      title: template.title,
      description: template.description,
      cronExpression: template.cronExpression,
      taskDefaults: template.taskDefaults as Record<string, unknown> | null,
      nextDue: nextDue,
      isActive: template.isActive,
      lastGenerated: template.lastGenerated,
    });

    await prisma.recurringTemplate.update({
      where: { id: template.id },
      data: {
        lastGenerated: now,
        nextDue,
      },
    });

    generated++;
  }

  return NextResponse.json({
    generated,
    skipped,
    total: templates.length,
  });
}
