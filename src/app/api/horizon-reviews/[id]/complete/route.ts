import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.horizonReview.findFirst({
    where: { id: params.id, userId },
  });

  if (!existing) return notFound("Horizon review not found");

  if (existing.status === "COMPLETED") {
    return badRequest("Review is already completed");
  }

  const review = await prisma.horizonReview.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  return NextResponse.json(review);
}
