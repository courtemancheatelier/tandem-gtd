import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createEventSchema } from "@/lib/validations/event";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { createEvent } = await import("@/lib/services/event-service");

  try {
    const event = await createEvent(parsed.data, userId);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found") || error.message.includes("not owned")) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.includes("already has")) {
        return badRequest(error.message);
      }
    }
    throw error;
  }
}
