import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { createSubProjectSchema } from "@/lib/validations/project";
import { createProject } from "@/lib/services/project-service";
import { computeChildInitialStatus, computeChildSortOrder } from "@/lib/sub-project-sequencing";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const parent = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!parent) return notFound("Parent project not found");

  if (parent.depth >= 2) {
    return badRequest("Maximum sub-project depth (3 levels) reached");
  }

  const body = await req.json();
  const parsed = createSubProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const depth = parent.depth + 1;
  const path = parent.path + parent.id + "/";

  // Compute initial status and sortOrder based on parent's childType
  const initialStatus = await computeChildInitialStatus(parent.id, parent.childType);
  const sortOrder = await computeChildSortOrder(parent.id);

  const project = await createProject(
    userId,
    {
      title: parsed.data.title,
      type: parsed.data.type,
      childType: "SEQUENTIAL",
      outcome: parsed.data.outcome,
      description: parsed.data.description,
      areaId: parent.areaId ?? undefined,
      goalId: parent.goalId ?? undefined,
      isSomedayMaybe: false,
    },
    {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    }
  );

  // Update with sub-project hierarchy fields + sequencing
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      parentProjectId: parent.id,
      depth,
      path,
      status: initialStatus,
      sortOrder,
      version: { increment: 1 },
    },
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json(updated, { status: 201 });
}
