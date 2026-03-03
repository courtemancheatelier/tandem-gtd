import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateGoalSchema } from "@/lib/validations/goal";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const goal = await prisma.goal.findFirst({
    where: { id: params.id, userId },
    include: {
      area: {
        select: { id: true, name: true },
      },
      projects: {
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  });

  if (!goal) return notFound("Goal not found");

  return NextResponse.json(goal);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.goal.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Goal not found");

  const body = await req.json();
  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { targetDate, ...rest } = parsed.data;

  const data: Record<string, unknown> = { ...rest };
  if (targetDate !== undefined) {
    data.targetDate = targetDate ? new Date(targetDate) : null;
  }

  const goal = await prisma.goal.update({
    where: { id: params.id },
    data,
    include: {
      area: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(goal);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.goal.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Goal not found");

  await prisma.goal.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
