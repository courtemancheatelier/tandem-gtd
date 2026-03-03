import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";

/**
 * PATCH /api/projects/[id]/retention — Toggle retentionExempt
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const retentionExempt = typeof body.retentionExempt === "boolean" ? body.retentionExempt : undefined;

  if (retentionExempt === undefined) {
    return NextResponse.json({ error: "retentionExempt (boolean) is required" }, { status: 400 });
  }

  const teamIds = await getUserTeamIds(userId);
  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
  });

  if (!project) return notFound("Project not found");

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      retentionExempt,
      // If exempting and a purge was scheduled, clear it
      ...(retentionExempt && project.purgeScheduledAt
        ? { purgeScheduledAt: null }
        : {}),
    },
    select: { id: true, retentionExempt: true, purgeScheduledAt: true },
  });

  // Log exemption changes
  if (retentionExempt && project.purgeScheduledAt) {
    await prisma.retentionLog.create({
      data: {
        action: "CANCELLED",
        projectId: project.id,
        projectTitle: project.title,
        actorType: "USER",
        actorId: userId,
        details: { reason: "exempted", previousPurgeDate: project.purgeScheduledAt.toISOString() },
      },
    });
  }

  return NextResponse.json(updated);
}
