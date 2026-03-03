import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createHorizonReviewSchema } from "@/lib/validations/horizon-review";

const CHECKLIST_BY_TYPE: Record<string, Record<string, boolean>> = {
  INITIAL_SETUP: {
    purpose: false,
    vision: false,
    goals: false,
    areas: false,
    projects: false,
    actions: false,
  },
  QUARTERLY: {
    goals: false,
    vision: false,
    purpose: false,
  },
  ANNUAL: {
    purpose: false,
    vision: false,
    goals: false,
    areas: false,
    projects: false,
    actions: false,
  },
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
  const skip = (page - 1) * limit;
  const type = searchParams.get("type");

  const where: Record<string, unknown> = { userId };
  if (type && ["INITIAL_SETUP", "QUARTERLY", "ANNUAL"].includes(type)) {
    where.type = type;
  }

  const [reviews, total] = await Promise.all([
    prisma.horizonReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.horizonReview.count({ where }),
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
  const parsed = createHorizonReviewSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Check if there's already an in-progress review
  const existing = await prisma.horizonReview.findFirst({
    where: { userId, status: "IN_PROGRESS" },
  });

  if (existing) {
    return badRequest("You already have a horizon review in progress. Complete or delete it first.");
  }

  const review = await prisma.horizonReview.create({
    data: {
      userId,
      type: parsed.data.type,
      checklist: CHECKLIST_BY_TYPE[parsed.data.type],
      notes: {},
    },
  });

  return NextResponse.json(review, { status: 201 });
}
