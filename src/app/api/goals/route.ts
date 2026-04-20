import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createGoalSchema } from "@/lib/validations/goal";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const horizon = searchParams.get("horizon");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { userId };

  if (horizon) {
    where.horizon = horizon;
  }

  if (status) {
    where.status = status;
  }

  const goals = await prisma.goal.findMany({
    where,
    include: {
      area: {
        select: { id: true, name: true },
      },
      _count: {
        select: { projects: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const result = goals.map(({ _count, ...goal }) => ({
    ...goal,
    projectCount: _count.projects,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { targetDate, ...rest } = parsed.data;

  const goal = await prisma.goal.create({
    data: {
      ...rest,
      targetDate: targetDate ? new Date(targetDate) : null,
      userId,
    },
    include: {
      area: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
