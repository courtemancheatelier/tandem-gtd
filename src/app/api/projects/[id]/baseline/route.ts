import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  notFound,
  badRequest,
} from "@/lib/api/auth-helpers";
import { captureBaselineSchema } from "@/lib/validations/project";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!project) return notFound("Project not found");

  const baselines = await prisma.baselineSnapshot.findMany({
    where: { projectId: params.id },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    baselines.map((b) => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt.toISOString(),
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      childProjects: { select: { id: true, childProjects: { select: { id: true } } } },
    },
  });
  if (!project) return notFound("Project not found");

  const body = await req.json();
  const parsed = captureBaselineSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Collect all project IDs in the tree
  const projectIds: string[] = [project.id];
  for (const child of project.childProjects) {
    projectIds.push(child.id);
    for (const gc of child.childProjects) {
      projectIds.push(gc.id);
    }
  }

  // Fetch all tasks with date/status fields for the snapshot
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, userId },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledDate: true,
      dueDate: true,
      estimatedMins: true,
      sortOrder: true,
      projectId: true,
      isMilestone: true,
      percentComplete: true,
    },
  });

  const baseline = await prisma.baselineSnapshot.create({
    data: {
      projectId: params.id,
      userId,
      name: parsed.data.name,
      snapshotData: JSON.parse(JSON.stringify(tasks)),
    },
  });

  return NextResponse.json(
    {
      id: baseline.id,
      name: baseline.name,
      createdAt: baseline.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
