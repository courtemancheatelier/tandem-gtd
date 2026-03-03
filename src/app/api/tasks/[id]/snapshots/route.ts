import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { getSnapshots } from "@/lib/history/snapshot";

/**
 * GET /api/tasks/[id]/snapshots
 * List all snapshots for a task, with associated event info.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const result = await getSnapshots(params.id, { limit, offset });

  return NextResponse.json(result);
}
