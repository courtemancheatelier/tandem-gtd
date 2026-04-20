import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { reactionSchema } from "@/lib/validations/thread";
import { addReaction, removeReaction } from "@/lib/services/thread-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const reaction = await addReaction(params.mid, userId, parsed.data.emoji);
    return NextResponse.json(reaction, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Message not found") return notFound("Message not found");
      if (error.message.includes("Not a member")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; mid: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    await removeReaction(params.mid, userId, parsed.data.emoji);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Message not found") return notFound("Message not found");
      if (error.message.includes("Not a member")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    throw error;
  }
}
