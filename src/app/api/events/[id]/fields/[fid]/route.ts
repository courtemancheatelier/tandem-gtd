import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { updateEventFieldSchema } from "@/lib/validations/event";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; fid: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = updateEventFieldSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { updateField } = await import("@/lib/services/event-service");

  try {
    const field = await updateField(params.id, params.fid, userId, parsed.data);
    return NextResponse.json(field);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found" || error.message === "Field not found")
        return notFound(error.message);
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; fid: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { deleteField } = await import("@/lib/services/event-service");

  try {
    await deleteField(params.id, params.fid, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found" || error.message === "Field not found")
        return notFound(error.message);
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
