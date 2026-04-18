import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { diffSnapshot } from "@/lib/history/snapshot";

/**
 * GET /api/tasks/[id]/snapshots/[snapshotId]
 * Get snapshot detail including a diff with the current task state.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; snapshotId: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify task belongs to user
  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!task) return notFound("Task not found");

  // Verify snapshot belongs to this task
  const snapshot = await prisma.taskSnapshot.findFirst({
    where: { id: params.snapshotId, taskId: params.id },
    select: { id: true },
  });
  if (!snapshot) return notFound("Snapshot not found");

  try {
    const result = await diffSnapshot(params.snapshotId);
    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("No record found")
    ) {
      return notFound("Snapshot not found");
    }
    throw error;
  }
}
