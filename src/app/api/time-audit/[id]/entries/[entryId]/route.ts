import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { updateEntrySchema } from "@/lib/validations/time-audit";

/** PATCH /api/time-audit/[id]/entries/[entryId] — Update entry */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify challenge belongs to user
  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!challenge) return notFound("Challenge not found");

  const entry = await prisma.timeAuditEntry.findFirst({
    where: { id: params.entryId, challengeId: params.id },
  });
  if (!entry) return notFound("Entry not found");

  const body = await req.json();
  const parsed = updateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Validate taskId if provided
  if (parsed.data.taskId) {
    const task = await prisma.task.findFirst({
      where: { id: parsed.data.taskId, userId },
      select: { id: true },
    });
    if (!task) return badRequest("Task not found");
  }

  const updated = await prisma.timeAuditEntry.update({
    where: { id: params.entryId },
    data: {
      ...(parsed.data.tags !== undefined && { tags: parsed.data.tags }),
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
      ...(parsed.data.taskId !== undefined && { taskId: parsed.data.taskId }),
    },
  });

  return NextResponse.json(updated);
}

/** DELETE /api/time-audit/[id]/entries/[entryId] — Delete entry */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!challenge) return notFound("Challenge not found");

  const entry = await prisma.timeAuditEntry.findFirst({
    where: { id: params.entryId, challengeId: params.id },
    select: { id: true },
  });
  if (!entry) return notFound("Entry not found");

  await prisma.timeAuditEntry.delete({ where: { id: params.entryId } });

  return NextResponse.json({ success: true });
}
