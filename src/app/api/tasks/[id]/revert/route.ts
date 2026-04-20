import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  notFound,
  badRequest,
} from "@/lib/api/auth-helpers";
import { revertToSnapshot } from "@/lib/history/snapshot";

/**
 * POST /api/tasks/[id]/revert
 * Revert a task to the state captured in a specific snapshot.
 * Body: { snapshotId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify task belongs to user
  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!task) return notFound("Task not found");

  // Parse request body
  let body: { snapshotId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.snapshotId || typeof body.snapshotId !== "string") {
    return badRequest("snapshotId is required");
  }

  // Verify snapshot belongs to this task
  const snapshot = await prisma.taskSnapshot.findFirst({
    where: { id: body.snapshotId, taskId: params.id },
    select: { id: true },
  });
  if (!snapshot) return notFound("Snapshot not found for this task");

  try {
    const result = await revertToSnapshot(body.snapshotId, userId);

    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      eventId: result.eventId,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return unauthorized();
      }
      if (error.message.includes("No changes to revert")) {
        return badRequest("No changes to revert to this snapshot");
      }
    }
    throw error;
  }
}
