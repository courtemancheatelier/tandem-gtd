import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { moveProjectSchema } from "@/lib/validations/project";
import { recalculateProjectRollups } from "@/lib/cascade";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = moveProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { newParentId } = parsed.data;

  // Verify source project exists and belongs to user
  const source = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!source) return notFound("Project not found");

  const oldParentId = source.parentProjectId;

  if (newParentId === params.id) {
    return badRequest("Cannot move a project under itself");
  }

  let newDepth = 0;
  let newPath = "";

  if (newParentId) {
    const target = await prisma.project.findFirst({
      where: { id: newParentId, userId },
    });
    if (!target) return notFound("Target parent project not found");

    // Prevent moving under a descendant (cycle detection)
    if (target.path.includes(params.id + "/")) {
      return badRequest("Cannot move a project under one of its descendants");
    }

    newDepth = target.depth + 1;
    if (newDepth > 2) {
      return badRequest("Maximum sub-project depth (3 levels) would be exceeded");
    }

    newPath = target.path + target.id + "/";
  }

  // Update the project
  await prisma.project.update({
    where: { id: params.id },
    data: {
      parentProjectId: newParentId,
      depth: newDepth,
      path: newPath,
      version: { increment: 1 },
    },
  });

  // Recursively update descendants
  await updateDescendants(params.id, newDepth, newPath + params.id + "/");

  // Recalculate rollups for old and new parents
  const rollupResults = [];
  if (oldParentId) {
    const results = await recalculateProjectRollups(oldParentId);
    rollupResults.push(...results);
  }
  if (newParentId) {
    const results = await recalculateProjectRollups(newParentId);
    rollupResults.push(...results);
  }

  const updated = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({ project: updated, updatedRollups: rollupResults });
}

async function updateDescendants(
  parentId: string,
  parentDepth: number,
  parentFullPath: string
): Promise<void> {
  const children = await prisma.project.findMany({
    where: { parentProjectId: parentId },
    select: { id: true },
  });

  for (const child of children) {
    const childDepth = parentDepth + 1;
    await prisma.project.update({
      where: { id: child.id },
      data: {
        depth: childDepth,
        path: parentFullPath,
        version: { increment: 1 },
      },
    });
    await updateDescendants(child.id, childDepth, parentFullPath + child.id + "/");
  }
}
