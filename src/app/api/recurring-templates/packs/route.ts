import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { TEMPLATE_PACKS, getPackById } from "@/lib/template-packs";
import { getNextOccurrence, generateTaskFromTemplate } from "@/lib/recurring";

/**
 * GET — list available template packs with metadata.
 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const packs = TEMPLATE_PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    templateCount: pack.templates.length,
    preview: pack.templates.slice(0, 3).map((t) => t.title),
  }));

  return NextResponse.json(packs);
}

/**
 * POST { packId } — create all templates from a pack and generate
 * initial tasks for any that are due today or overdue.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const packId = body.packId;
  if (!packId || typeof packId !== "string") {
    return badRequest("packId is required");
  }

  const pack = getPackById(packId);
  if (!pack) {
    return badRequest(`Unknown pack: ${packId}`);
  }

  const now = new Date();
  const createdIds: string[] = [];
  const generatedTaskIds: string[] = [];

  for (const def of pack.templates) {
    const nextDue = getNextOccurrence(def.cronExpression, now);

    const template = await prisma.recurringTemplate.create({
      data: {
        title: def.title,
        description: def.description,
        cronExpression: def.cronExpression,
        color: def.color,
        estimatedMins: def.estimatedMins,
        nextDue,
        isActive: true,
        userId,
      },
    });

    createdIds.push(template.id);

    // For daily templates, nextDue is tomorrow — generate a task for today
    // so the Card File isn't empty on first load.
    // For other frequencies, generate if nextDue <= end of today.
    const endOfToday = new Date(now);
    endOfToday.setUTCHours(23, 59, 59, 999);

    if (def.cronExpression === "daily" || nextDue <= endOfToday) {
      const scheduledDate =
        def.cronExpression === "daily" ? now : nextDue;

      const task = await generateTaskFromTemplate({
        id: template.id,
        userId,
        title: def.title,
        description: def.description,
        cronExpression: def.cronExpression,
        taskDefaults: null,
        nextDue: scheduledDate,
        isActive: true,
        lastGenerated: null,
      });

      generatedTaskIds.push(task.id);

      await prisma.recurringTemplate.update({
        where: { id: template.id },
        data: { lastGenerated: now },
      });
    }
  }

  return NextResponse.json(
    {
      templateIds: createdIds,
      taskIds: generatedTaskIds,
      message: `Loaded ${createdIds.length} templates from "${pack.name}". ${generatedTaskIds.length} tasks ready in your Card File.`,
    },
    { status: 201 }
  );
}
