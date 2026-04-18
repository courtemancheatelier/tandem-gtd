import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";

/**
 * GET /api/events/[id]/rsvp
 * Authenticated — looks up event + invitation by the logged-in user's email.
 *
 * POST /api/events/[id]/rsvp
 * Authenticated — submits RSVP for the logged-in user.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { prisma } = await import("@/lib/prisma");

  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      fields: {
        where: { isOrgOnly: false },
        orderBy: { sortOrder: "asc" },
      },
      project: { select: { title: true } },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Find invitation by email
  const invitation = await prisma.eventInvitation.findFirst({
    where: { eventId: event.id, email: user.email.toLowerCase() },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "You are not on the guest list for this event." },
      { status: 403 }
    );
  }

  // Check for existing response
  const existingResponse = await prisma.eventResponse.findUnique({
    where: { eventId_userId: { eventId: event.id, userId } },
  });

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      eventDate: event.eventDate,
      isLocked: event.isLocked,
      fields: event.fields,
      projectTitle: event.project.title,
    },
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
    },
    existingResponse: existingResponse
      ? { attendance: existingResponse.attendance, fieldValues: existingResponse.fieldValues }
      : null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();

  const { submitRsvpSchema } = await import("@/lib/validations/event");
  const parsed = submitRsvpSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }
  const { attendance, fieldValues } = parsed.data;

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.isLocked) {
    return NextResponse.json({ error: "This event is no longer accepting responses." }, { status: 403 });
  }

  // Verify invitation exists
  const invitation = await prisma.eventInvitation.findFirst({
    where: { eventId: event.id, email: user.email.toLowerCase() },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "You are not on the guest list for this event." },
      { status: 403 }
    );
  }

  // Update invitation
  if (invitation.status === "PENDING") {
    await prisma.eventInvitation.update({
      where: { id: invitation.id },
      data: {
        status: attendance === "NO" ? "DECLINED" : "ACCEPTED",
        acceptedAt: attendance !== "NO" ? new Date() : undefined,
        userId,
      },
    });
  }

  // Upsert response
  const response = await prisma.eventResponse.upsert({
    where: { eventId_userId: { eventId: event.id, userId } },
    create: {
      eventId: event.id,
      userId,
      attendance,
      fieldValues: fieldValues || {},
    },
    update: {
      attendance,
      fieldValues: fieldValues || {},
    },
  });

  return NextResponse.json(response);
}
