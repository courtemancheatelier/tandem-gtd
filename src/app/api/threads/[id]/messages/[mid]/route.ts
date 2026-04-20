import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { updateMessageSchema } from "@/lib/validations/thread";
import { editMessage, deleteMessage } from "@/lib/services/thread-service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = updateMessageSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const message = await editMessage(params.mid, userId, parsed.data.content);
    return NextResponse.json(message);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Message not found") return notFound("Message not found");
      if (error.message.includes("Not authorized")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    await deleteMessage(params.mid, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Message not found") return notFound("Message not found");
      if (error.message.includes("Not authorized")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
