import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { bulkProjectUpdateSchema } from "@/lib/validations/bulk";
import { getUserTeamIds } from "@/lib/services/team-permissions";

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = bulkProjectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { projectIds, updates } = parsed.data;

  const teamIds = await getUserTeamIds(userId);
  const projects = await prisma.project.findMany({
    where: {
      id: { in: projectIds },
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
    select: { id: true, status: true, areaId: true },
  });

  const accessibleIds = new Set(projects.map((p) => p.id));

  const data: Record<string, unknown> = {};
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.areaId !== undefined) data.areaId = updates.areaId;

  let updated = 0;
  let skipped = 0;

  for (const project of projects) {
    const alreadyMatches =
      (updates.status === undefined || project.status === updates.status) &&
      (updates.areaId === undefined || project.areaId === updates.areaId);

    if (alreadyMatches) {
      skipped++;
      continue;
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { ...data, version: { increment: 1 } },
    });
    updated++;
  }

  return NextResponse.json({
    updated,
    skipped,
    inaccessible: projectIds.length - accessibleIds.size,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const { projectIds } = body;

  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return badRequest("At least 1 project ID required");
  }
  if (projectIds.length > 50) {
    return badRequest("Maximum 50 projects per batch");
  }

  const teamIds = await getUserTeamIds(userId);
  const projects = await prisma.project.findMany({
    where: {
      id: { in: projectIds },
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
    select: { id: true },
  });

  const accessibleIds = projects.map((p) => p.id);

  if (accessibleIds.length === 0) {
    return badRequest("No accessible projects found");
  }

  // Delete tasks first, then projects
  await prisma.task.deleteMany({
    where: { projectId: { in: accessibleIds } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: accessibleIds } },
  });

  return NextResponse.json({
    deleted: accessibleIds.length,
    skipped: projectIds.length - accessibleIds.length,
  });
}
