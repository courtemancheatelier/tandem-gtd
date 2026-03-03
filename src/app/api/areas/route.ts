import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createAreaSchema } from "@/lib/validations/area";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");

  const where: Record<string, unknown> = { userId };
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const areas = await prisma.area.findMany({
    where,
    include: {
      _count: {
        select: {
          projects: true,
          goals: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Compute active project count per area
  const areasWithCounts = await Promise.all(
    areas.map(async (area) => {
      const activeProjectCount = await prisma.project.count({
        where: {
          areaId: area.id,
          userId,
          status: "ACTIVE",
        },
      });

      const { _count, ...rest } = area;
      return {
        ...rest,
        projectCount: _count.projects,
        activeProjectCount,
        goalCount: _count.goals,
      };
    })
  );

  return NextResponse.json(areasWithCounts);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createAreaSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const area = await prisma.area.create({
    data: {
      ...parsed.data,
      userId,
    },
  });

  return NextResponse.json(area, { status: 201 });
}
