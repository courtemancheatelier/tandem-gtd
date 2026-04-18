import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { createEventFieldSchema } from "@/lib/validations/event";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createEventFieldSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { addField } = await import("@/lib/services/event-service");

  try {
    const field = await addField(params.id, userId, parsed.data);
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") return notFound("Event not found");
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
