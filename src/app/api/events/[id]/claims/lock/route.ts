import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, forbidden, notFound } from "@/lib/api/auth-helpers";
import { claimLockSchema } from "@/lib/validations/event";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { acquireClaimLock, isEventInvitee } = await import("@/lib/services/event-service");

  try {
    const allowed = await isEventInvitee(params.id, userId);
    if (!allowed) return forbidden();
  } catch (error) {
    if (error instanceof Error && error.message === "Event not found") {
      return notFound("Event not found");
    }
    throw error;
  }

  const body = await req.json();
  const parsed = claimLockSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const lock = await acquireClaimLock(params.id, parsed.data.fieldId, parsed.data.optionKey, userId);
    return NextResponse.json(lock, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already claimed")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
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

  const { releaseClaimLock, isEventInvitee } = await import("@/lib/services/event-service");

  try {
    const allowed = await isEventInvitee(params.id, userId);
    if (!allowed) return forbidden();
  } catch (error) {
    if (error instanceof Error && error.message === "Event not found") {
      return notFound("Event not found");
    }
    throw error;
  }

  const body = await req.json();
  const parsed = claimLockSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    await releaseClaimLock(parsed.data.fieldId, parsed.data.optionKey, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot release")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
