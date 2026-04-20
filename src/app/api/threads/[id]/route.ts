import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateThreadSchema } from "@/lib/validations/thread";
import { getThread, resolveThread, assertThreadAccess } from "@/lib/services/thread-service";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  try {
    await assertThreadAccess(params.id, auth.userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Thread not found") return notFound("Thread not found");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thread = await getThread(params.id);
  if (!thread) return notFound("Thread not found");

  return NextResponse.json(thread);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    await assertThreadAccess(params.id, userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Thread not found") return notFound("Thread not found");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Check for resolve action
  if (body.resolve === true) {
    try {
      const thread = await resolveThread(params.id, userId, {
        actorType: "USER",
        actorId: userId,
        source: "TEAM_SYNC",
      });
      return NextResponse.json(thread);
    } catch (error) {
      if (error instanceof Error && error.message === "Thread not found") {
        return notFound("Thread not found");
      }
      throw error;
    }
  }

  // Otherwise update thread metadata
  const parsed = updateThreadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const thread = await prisma.thread.update({
    where: { id: params.id },
    data: parsed.data,
    include: {
      createdBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(thread);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    await assertThreadAccess(params.id, userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Thread not found") return notFound("Thread not found");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thread = await prisma.thread.findUnique({
    where: { id: params.id },
    select: { createdById: true },
  });
  if (!thread) return notFound("Thread not found");
  if (thread.createdById !== userId) {
    return NextResponse.json({ error: "Only the thread creator can delete" }, { status: 403 });
  }

  await prisma.thread.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
