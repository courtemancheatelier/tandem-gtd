import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { sampleAreas, sampleProjects, sampleInboxItems } from "@/lib/onboarding/sample-data";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const createdIds: {
    areaIds: string[];
    projectIds: string[];
    taskIds: string[];
    inboxIds: string[];
  } = { areaIds: [], projectIds: [], taskIds: [], inboxIds: [] };

  // Create areas
  for (const area of sampleAreas) {
    const created = await prisma.area.create({
      data: { ...area, userId },
    });
    createdIds.areaIds.push(created.id);
  }

  // Create projects with tasks
  for (const proj of sampleProjects) {
    const created = await prisma.project.create({
      data: {
        title: proj.title,
        type: proj.type,
        outcome: proj.outcome,
        userId,
        // Link first project to first area if available
        areaId: createdIds.areaIds[0] || undefined,
      },
    });
    createdIds.projectIds.push(created.id);

    for (let i = 0; i < proj.tasks.length; i++) {
      const task = await prisma.task.create({
        data: {
          title: proj.tasks[i].title,
          userId,
          projectId: created.id,
          sortOrder: i,
          // In sequential projects, only first task is next action
          isNextAction: proj.type === "SEQUENTIAL" ? i === 0 : true,
        },
      });
      createdIds.taskIds.push(task.id);
    }
  }

  // Create inbox items
  for (const item of sampleInboxItems) {
    const created = await prisma.inboxItem.create({
      data: { content: item.title, userId },
    });
    createdIds.inboxIds.push(created.id);
  }

  return NextResponse.json(createdIds, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const { areaIds, projectIds, taskIds, inboxIds } = body;

  if (!areaIds && !projectIds && !taskIds && !inboxIds) {
    return badRequest("No IDs provided");
  }

  // Delete tasks (owned by user)
  if (taskIds?.length > 0) {
    await prisma.task.deleteMany({
      where: { id: { in: taskIds }, userId },
    });
  }

  // Delete projects (owned by user) — this also cascades task cleanup
  if (projectIds?.length > 0) {
    await prisma.project.deleteMany({
      where: { id: { in: projectIds }, userId },
    });
  }

  // Delete inbox items (owned by user)
  if (inboxIds?.length > 0) {
    await prisma.inboxItem.deleteMany({
      where: { id: { in: inboxIds }, userId },
    });
  }

  // Delete areas (owned by user)
  if (areaIds?.length > 0) {
    await prisma.area.deleteMany({
      where: { id: { in: areaIds }, userId },
    });
  }

  return NextResponse.json({ success: true });
}
