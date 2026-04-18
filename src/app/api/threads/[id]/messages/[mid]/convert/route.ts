import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { z } from "zod";
import {
  assertThreadAccess,
  convertMessageToInbox,
  convertMessageToTask,
} from "@/lib/services/thread-service";

const convertSchema = z.object({
  target: z.enum(["inbox", "task"]),
  projectId: z.string().optional(),
  contextId: z.string().optional(),
  isNextAction: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify thread access
  try {
    await assertThreadAccess(params.id, userId);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Thread not found") return notFound("Thread not found");
      if (error.message.includes("Not a member")) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
    }
    throw error;
  }

  const body = await req.json();
  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { target, projectId, contextId, isNextAction } = parsed.data;

  try {
    if (target === "inbox") {
      const item = await convertMessageToInbox(params.mid, userId);
      return NextResponse.json(item, { status: 201 });
    } else {
      const task = await convertMessageToTask(params.mid, userId, {
        projectId,
        contextId,
        isNextAction,
      });
      return NextResponse.json(task, { status: 201 });
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Message not found") return notFound("Message not found");
      if (error.message === "Project not found") return notFound("Project not found");
    }
    throw error;
  }
}
