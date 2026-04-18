import { prisma } from "@/lib/prisma";
import type {
  CreateEventInput,
  UpdateEventInput,
  CreateEventFieldInput,
  UpdateEventFieldInput,
} from "@/lib/validations/event";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function assertEventOwner(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { ownerId: true },
  });
  if (!event) throw new Error("Event not found");
  if (event.ownerId !== userId) throw new Error("Forbidden");
  return event;
}

/** Returns true if the user is the event owner OR has an invitation to the event. */
export async function isEventOwnerOrInvitee(eventId: string, userId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { ownerId: true },
  });
  if (!event) throw new Error("Event not found");
  if (event.ownerId === userId) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return false;

  const invitation = await prisma.eventInvitation.findFirst({
    where: { eventId, email: user.email.toLowerCase() },
  });
  return !!invitation;
}

/** Returns true if the user has an invitation to the event (or is the owner). */
export async function isEventInvitee(eventId: string, userId: string): Promise<boolean> {
  return isEventOwnerOrInvitee(eventId, userId);
}

// ── Events ──────────────────────────────────────────────────────────────────

export async function createEvent(data: CreateEventInput, userId: string) {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, userId },
    select: { id: true, teamId: true },
  });
  if (!project) throw new Error("Project not found or not owned by user");

  // Check no existing event for this project
  const existing = await prisma.event.findUnique({
    where: { projectId: data.projectId },
  });
  if (existing) throw new Error("Project already has an event");

  const event = await prisma.event.create({
    data: {
      title: data.title,
      description: data.description,
      eventDate: new Date(data.eventDate),
      lockDate: data.lockDate ? new Date(data.lockDate) : undefined,
      projectId: data.projectId,
      teamId: data.teamId || project.teamId || undefined,
      ownerId: userId,
    },
    include: {
      fields: true,
      _count: { select: { invitations: true, responses: true } },
    },
  });

  // Auto-add organizer to guest list so they can use the RSVP link too
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (owner) {
    await prisma.eventInvitation.create({
      data: {
        eventId: event.id,
        email: owner.email.toLowerCase(),
        role: "Organizer",
        status: "ACCEPTED",
        acceptedAt: new Date(),
        userId,
      },
    });
  }

  return event;
}

export async function getEvent(eventId: string, opts?: { includeOrgOnly?: boolean }) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fields: {
        ...(opts?.includeOrgOnly ? {} : { where: { isOrgOnly: false } }),
        orderBy: { sortOrder: "asc" },
      },
      invitations: {
        orderBy: { sentAt: "asc" },
        select: { id: true, email: true, role: true, status: true },
      },
      _count: { select: { invitations: true, responses: true } },
      project: { select: { id: true, title: true, teamId: true, userId: true } },
    },
  });
  if (!event) throw new Error("Event not found");
  return event;
}

export async function updateEvent(eventId: string, userId: string, data: UpdateEventInput) {
  await assertEventOwner(eventId, userId);

  return prisma.event.update({
    where: { id: eventId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.eventDate !== undefined && { eventDate: new Date(data.eventDate) }),
      ...(data.lockDate !== undefined && { lockDate: data.lockDate ? new Date(data.lockDate) : null }),
      ...(data.isLocked !== undefined && { isLocked: data.isLocked }),
    },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      _count: { select: { invitations: true, responses: true } },
    },
  });
}

export async function deleteEvent(eventId: string, userId: string) {
  await assertEventOwner(eventId, userId);
  return prisma.event.delete({ where: { id: eventId } });
}

// ── Event Fields ────────────────────────────────────────────────────────────

export async function addField(eventId: string, userId: string, data: CreateEventFieldInput) {
  await assertEventOwner(eventId, userId);

  return prisma.eventField.create({
    data: {
      eventId,
      type: data.type,
      label: data.label,
      isRequired: data.isRequired ?? false,
      isOrgOnly: data.isOrgOnly ?? false,
      sortOrder: data.sortOrder ?? 0,
      options: data.options ?? undefined,
    },
  });
}

export async function updateField(
  eventId: string,
  fieldId: string,
  userId: string,
  data: UpdateEventFieldInput
) {
  await assertEventOwner(eventId, userId);

  // Verify field belongs to event
  const field = await prisma.eventField.findFirst({
    where: { id: fieldId, eventId },
  });
  if (!field) throw new Error("Field not found");

  return prisma.eventField.update({
    where: { id: fieldId },
    data,
  });
}

export async function deleteField(eventId: string, fieldId: string, userId: string) {
  await assertEventOwner(eventId, userId);

  const field = await prisma.eventField.findFirst({
    where: { id: fieldId, eventId },
  });
  if (!field) throw new Error("Field not found");

  return prisma.eventField.delete({ where: { id: fieldId } });
}

// ── Invitations ─────────────────────────────────────────────────────────────

export async function createInvitations(
  eventId: string,
  userId: string,
  emails: string[],
  role?: string
) {
  await assertEventOwner(eventId, userId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true, eventDate: true },
  });

  // Filter out emails that already have an invitation for this event
  const normalizedEmails = emails.map((e) => e.toLowerCase());
  const existingInvitations = await prisma.eventInvitation.findMany({
    where: { eventId, email: { in: normalizedEmails } },
    select: { email: true },
  });
  const existingEmails = new Set(existingInvitations.map((i) => i.email));
  const newEmails = normalizedEmails.filter((e) => !existingEmails.has(e));

  if (newEmails.length === 0) return [];

  const invitations = await prisma.$transaction(
    newEmails.map((email) =>
      prisma.eventInvitation.create({
        data: {
          eventId,
          email,
          role,
        },
      })
    )
  );

  // Send invitation emails (fire-and-forget)
  if (event) {
    const { sendEmail } = await import("@/lib/email");
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";
    const rsvpUrl = `${baseUrl}/rsvp/${eventId}`;
    const eventDateStr = new Date(event.eventDate).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    for (const email of newEmails) {
      sendEmail({
        to: email,
        subject: `You're invited: ${event.title}`,
        text: [
          `You're invited to ${event.title}!`,
          "",
          `When: ${eventDateStr}`,
          "",
          "Log in to RSVP:",
          rsvpUrl,
          "",
          "If you don't have an account yet, sign up with this email address and then visit the link above.",
        ].join("\n"),
      }).catch((err) => {
        console.error(`[event] Failed to send invitation email to ${email}:`, err);
      });
    }
  }

  return invitations;
}

export async function revokeInvitation(eventId: string, invitationId: string, userId: string) {
  await assertEventOwner(eventId, userId);

  const invitation = await prisma.eventInvitation.findFirst({
    where: { id: invitationId, eventId },
  });
  if (!invitation) throw new Error("Invitation not found");

  return prisma.eventInvitation.delete({ where: { id: invitationId } });
}

// ── Responses ───────────────────────────────────────────────────────────────

export async function getResponses(eventId: string, userId: string) {
  await assertEventOwner(eventId, userId);

  return prisma.eventResponse.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { submittedAt: "desc" },
  });
}

export async function getResponsesCsv(eventId: string, userId: string) {
  await assertEventOwner(eventId, userId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      responses: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { submittedAt: "asc" },
      },
    },
  });
  if (!event) throw new Error("Event not found");

  const headers = ["Name", "Email", "Attendance", ...event.fields.map((f) => f.label), "Submitted At"];
  const rows = event.responses.map((r) => {
    const vals = r.fieldValues as Record<string, unknown>;
    return [
      r.user.name,
      r.user.email,
      r.attendance,
      ...event.fields.map((f) => String(vals[f.id] ?? "")),
      r.submittedAt.toISOString(),
    ];
  });

  const csvEscape = (v: string) => {
    // Neutralize CSV formula injection
    if (/^[=+\-@]/.test(v)) {
      v = "'" + v;
    }
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

// ── Claim Locks ─────────────────────────────────────────────────────────────

const CLAIM_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function acquireClaimLock(
  eventId: string,
  fieldId: string,
  optionKey: string,
  userId: string
) {
  // Clean expired locks first
  await prisma.claimLock.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  try {
    // Attempt to create the lock atomically
    return await prisma.claimLock.create({
      data: {
        eventId,
        fieldId,
        optionKey,
        userId,
        expiresAt: new Date(Date.now() + CLAIM_LOCK_DURATION_MS),
      },
    });
  } catch (err: unknown) {
    // Unique constraint violation — lock already exists
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Check if it belongs to the same user (refresh it)
      const existing = await prisma.claimLock.findUnique({
        where: { fieldId_optionKey: { fieldId, optionKey } },
      });
      if (existing && existing.userId === userId) {
        return prisma.claimLock.update({
          where: { fieldId_optionKey: { fieldId, optionKey } },
          data: { expiresAt: new Date(Date.now() + CLAIM_LOCK_DURATION_MS) },
        });
      }
      throw new Error("Item is already claimed by another user");
    }
    throw err;
  }
}

export async function releaseClaimLock(fieldId: string, optionKey: string, userId: string) {
  const lock = await prisma.claimLock.findUnique({
    where: { fieldId_optionKey: { fieldId, optionKey } },
  });
  if (!lock) return null;
  if (lock.userId !== userId) throw new Error("Cannot release another user's claim");

  return prisma.claimLock.delete({
    where: { fieldId_optionKey: { fieldId, optionKey } },
  });
}

export async function getClaimStatus(eventId: string) {
  // Clean expired
  await prisma.claimLock.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return prisma.claimLock.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}
