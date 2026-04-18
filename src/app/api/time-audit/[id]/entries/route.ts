import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { createEntrySchema } from "@/lib/validations/time-audit";

/** POST /api/time-audit/[id]/entries — Create entry */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  if (!challenge) return notFound("Active challenge not found");

  const body = await req.json();
  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const intervalStart = new Date(parsed.data.intervalStart);
  const intervalEnd = new Date(parsed.data.intervalEnd);

  if (intervalEnd <= intervalStart) {
    return badRequest("intervalEnd must be after intervalStart");
  }

  // Validate interval is within challenge window
  if (intervalStart < challenge.startTime || intervalEnd > challenge.endTime) {
    return badRequest("Interval is outside the challenge window");
  }

  // Validate taskId if provided
  if (parsed.data.taskId) {
    const task = await prisma.task.findFirst({
      where: { id: parsed.data.taskId, userId },
      select: { id: true },
    });
    if (!task) return badRequest("Task not found");
  }

  const entry = await prisma.timeAuditEntry.create({
    data: {
      challengeId: params.id,
      intervalStart,
      intervalEnd,
      tags: parsed.data.tags,
      note: parsed.data.note ?? null,
      taskId: parsed.data.taskId ?? null,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}

/** GET /api/time-audit/[id]/entries — List entries for challenge */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!challenge) return notFound("Challenge not found");

  const entries = await prisma.timeAuditEntry.findMany({
    where: { challengeId: params.id },
    orderBy: { intervalStart: "asc" },
    include: {
      task: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json(entries);
}
