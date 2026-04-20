import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateWaitingForSchema } from "@/lib/validations/waiting-for";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.waitingFor.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Waiting-for item not found");

  const body = await req.json();
  const parsed = updateWaitingForSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.person !== undefined) data.person = parsed.data.person;

  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }
  if (parsed.data.followUpDate !== undefined) {
    data.followUpDate = parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null;
  }

  if (parsed.data.isResolved !== undefined) {
    data.isResolved = parsed.data.isResolved;
    if (parsed.data.isResolved) {
      data.resolvedAt = new Date();
    } else {
      data.resolvedAt = null;
    }
  }

  const item = await prisma.waitingFor.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.waitingFor.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Waiting-for item not found");

  await prisma.waitingFor.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
