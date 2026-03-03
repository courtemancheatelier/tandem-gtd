import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; baselineId: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!project) return notFound("Project not found");

  const baseline = await prisma.baselineSnapshot.findFirst({
    where: { id: params.baselineId, projectId: params.id },
  });
  if (!baseline) return notFound("Baseline not found");

  return NextResponse.json({
    id: baseline.id,
    name: baseline.name,
    createdAt: baseline.createdAt.toISOString(),
    snapshotData: baseline.snapshotData,
  });
}
