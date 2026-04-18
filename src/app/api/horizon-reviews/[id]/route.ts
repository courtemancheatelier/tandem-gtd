import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateHorizonReviewSchema } from "@/lib/validations/horizon-review";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const review = await prisma.horizonReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!review) return notFound("Horizon review not found");
  return NextResponse.json(review);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = updateHorizonReviewSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const existing = await prisma.horizonReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!existing) return notFound("Horizon review not found");

  // Merge checklist updates with existing checklist
  const existingChecklist = (existing.checklist as Record<string, boolean>) || {};
  const updatedChecklist = parsed.data.checklist
    ? { ...existingChecklist, ...parsed.data.checklist }
    : existingChecklist;

  // Merge notes updates with existing notes
  const existingNotes = (existing.notes as Record<string, string>) || {};
  const updatedNotes = parsed.data.notes
    ? { ...existingNotes, ...parsed.data.notes }
    : existingNotes;

  const review = await prisma.horizonReview.update({
    where: { id: params.id },
    data: {
      checklist: updatedChecklist,
      notes: updatedNotes,
    },
  });

  return NextResponse.json(review);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.horizonReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!existing) return notFound("Horizon review not found");

  await prisma.horizonReview.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true });
}
