import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createReviewSchema } from "@/lib/validations/review";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.weeklyReview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.weeklyReview.count({ where: { userId } }),
  ]);

  return NextResponse.json({
    reviews,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Check if there's already an in-progress review
  const existing = await prisma.weeklyReview.findFirst({
    where: { userId, status: "IN_PROGRESS" },
  });

  if (existing) {
    return badRequest("You already have a review in progress. Complete or skip it first.");
  }

  // Calculate the Monday of the current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const review = await prisma.weeklyReview.create({
    data: {
      userId,
      weekOf: monday,
      notes: parsed.data.notes || null,
      checklist: {
        getClear: false,
        getCurrent: false,
        getCreative: false,
      },
    },
  });

  return NextResponse.json(review, { status: 201 });
}
