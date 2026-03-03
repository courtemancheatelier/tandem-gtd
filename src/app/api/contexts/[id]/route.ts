import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateContextSchema } from "@/lib/validations/context";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.context.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Context not found");

  const body = await req.json();
  const parsed = updateContextSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const context = await prisma.context.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json(context);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.context.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Context not found");

  await prisma.context.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
