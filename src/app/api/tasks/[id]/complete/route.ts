import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { completeTask } from "@/lib/services/task-service";
import { VersionConflictError } from "@/lib/version-check";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let version: number | undefined;
  try {
    const body = await req.json();
    version = typeof body.version === "number" ? body.version : undefined;
  } catch {
    // No body or invalid JSON — version stays undefined
  }

  try {
    const { cascade } = await completeTask(params.id, userId, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    }, version);

    return NextResponse.json({
      success: true,
      cascade,
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json(
        { error: "CONFLICT", message: error.message, currentVersion: error.currentVersion, currentState: error.currentState },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "Task not found") {
      return notFound("Task not found");
    }
    throw error;
  }
}
