import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateReviewSchema } from "@/lib/validations/review";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const review = await prisma.weeklyReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!review) return notFound("Review not found");
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
  const parsed = updateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const existing = await prisma.weeklyReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!existing) return notFound("Review not found");

  // Merge checklist updates with existing checklist
  const existingChecklist = (existing.checklist as Record<string, boolean>) || {};
  const updatedChecklist = parsed.data.checklist
    ? { ...existingChecklist, ...parsed.data.checklist }
    : existingChecklist;

  const review = await prisma.weeklyReview.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      ...(parsed.data.aiCoachUsed !== undefined && { aiCoachUsed: parsed.data.aiCoachUsed }),
      ...(parsed.data.aiSummary !== undefined && { aiSummary: parsed.data.aiSummary }),
      checklist: updatedChecklist,
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

  const existing = await prisma.weeklyReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!existing) return notFound("Review not found");

  await prisma.weeklyReview.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true });
}
