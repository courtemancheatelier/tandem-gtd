import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { computeNextAction } from "@/lib/cascade";
import { writeTaskEvent } from "@/lib/history/event-writer";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; depId: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify the task belongs to the user
  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
  });
  if (!task) return notFound("Task not found");

  // Verify the dependency exists and relates to this task
  const dep = await prisma.taskDependency.findUnique({
    where: { id: params.depId },
  });
  if (!dep || (dep.successorId !== params.id && dep.predecessorId !== params.id)) {
    return notFound("Dependency not found");
  }

  await prisma.taskDependency.delete({
    where: { id: params.depId },
  });

  // Write DEPENDENCY_REMOVED event
  await writeTaskEvent(
    prisma,
    params.id,
    "DEPENDENCY_REMOVED",
    {
      dependency: {
        old: { predecessorId: dep.predecessorId, successorId: dep.successorId, type: dep.type },
        new: null,
      },
    },
    { actorType: "USER", actorId: userId, source: "MANUAL" }
  );

  // Recompute isNextAction for the successor task
  const successorId = dep.successorId;
  const successor = await prisma.task.findUnique({
    where: { id: successorId },
    include: {
      project: { select: { id: true, type: true } },
      predecessors: {
        include: {
          predecessor: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (
    successor &&
    successor.status !== "COMPLETED" &&
    successor.status !== "DROPPED" &&
    successor.project
  ) {
    const remainingPredecessorIds = successor.predecessors.map(
      (p) => p.predecessorId
    );
    const shouldBeNext = await computeNextAction({
      projectId: successor.project.id,
      projectType: successor.project.type,
      predecessorIds: remainingPredecessorIds,
      userId,
    });

    if (shouldBeNext !== successor.isNextAction) {
      await prisma.task.update({
        where: { id: successorId },
        data: { isNextAction: shouldBeNext, version: { increment: 1 } },
      });
    }
  }

  return NextResponse.json({ success: true });
}
