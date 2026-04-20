import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { updateEventSchema } from "@/lib/validations/event";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { getEvent, isEventOwnerOrInvitee } = await import("@/lib/services/event-service");

  try {
    const allowed = await isEventOwnerOrInvitee(params.id, userId);
    if (!allowed) return forbidden();

    // Owner sees all fields (including orgOnly); invitees do not
    const { prisma } = await import("@/lib/prisma");
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      select: { ownerId: true },
    });
    const isOwner = event?.ownerId === userId;

    const result = await getEvent(params.id, { includeOrgOnly: isOwner });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Event not found") {
      return notFound("Event not found");
    }
    throw error;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { updateEvent } = await import("@/lib/services/event-service");

  try {
    const event = await updateEvent(params.id, userId, parsed.data);
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") return notFound("Event not found");
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { deleteEvent } = await import("@/lib/services/event-service");

  try {
    await deleteEvent(params.id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") return notFound("Event not found");
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
