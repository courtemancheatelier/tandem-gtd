import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { addMessageSchema } from "@/lib/validations/thread";
import { addMessage } from "@/lib/services/thread-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = addMessageSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const message = await addMessage(params.id, userId, parsed.data);
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Thread not found") {
      return badRequest("Thread not found");
    }
    throw error;
  }
}
