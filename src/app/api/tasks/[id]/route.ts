import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { updateTaskSchema } from "@/lib/validations/task";
import { updateTask } from "@/lib/services/task-service";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { writeTaskEvent } from "@/lib/history/event-writer";
import { VersionConflictError } from "@/lib/version-check";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = params;
  const body = await req.json();

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const expectedVersion = parsed.data.version ?? body.version;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version: _v, ...updates } = parsed.data;

  // Optional enriched event note (e.g. reassignment context from team projects)
  const note = typeof body.note === "string" ? body.note.trim() : undefined;

  try {
    const task = await updateTask(id, userId, updates, {
      actorType: "USER",
      actorId: userId,
      source: note ? "TEAM_SYNC" : "MANUAL",
      message: note || undefined,
    }, expectedVersion);

    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json(
        { error: "CONFLICT", message: error.message, currentVersion: error.currentVersion, currentState: error.currentState },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "Task not found") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = params;

  // Find by ownership or team project membership
  let task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) {
    const teamIds = await getUserTeamIds(userId);
    if (teamIds.length > 0) {
      task = await prisma.task.findFirst({
        where: { id, project: { teamId: { in: teamIds } } },
      });
    }
  }
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  await writeTaskEvent(
    prisma,
    id,
    "ARCHIVED",
    { status: { old: task.status, new: "DELETED" } },
    { actorType: "USER", actorId: userId, source: "MANUAL" }
  );

  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
