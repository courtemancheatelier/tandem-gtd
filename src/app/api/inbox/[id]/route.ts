import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateInboxItemSchema } from "@/lib/validations/inbox";
import { z } from "zod";

const patchBodySchema = updateInboxItemSchema.extend({
  status: z.enum(["UNPROCESSED", "PROCESSED", "DELETED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.inboxItem.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Inbox item not found");

  const body = await req.json();
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const item = await prisma.inboxItem.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.inboxItem.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Inbox item not found");

  const item = await prisma.inboxItem.update({
    where: { id: params.id },
    data: { status: "DELETED" },
  });

  return NextResponse.json(item);
}
