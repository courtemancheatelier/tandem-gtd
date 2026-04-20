import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createWaitingForSchema } from "@/lib/validations/waiting-for";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get("resolved");

  const where: Record<string, unknown> = { userId };
  if (resolved === "true") {
    where.isResolved = true;
  } else if (resolved !== "all") {
    where.isResolved = false;
  }

  const items = await prisma.waitingFor.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
  });

  // Sort in application layer: items needing follow-up first, then upcoming, then open
  // Within each group, sort by followUpDate ASC (nulls last), then createdAt DESC
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const needsFollowUp: typeof items = [];
  const upcoming: typeof items = [];
  const open: typeof items = [];
  const resolvedItems: typeof items = [];

  for (const item of items) {
    if (item.isResolved) {
      resolvedItems.push(item);
    } else if (item.followUpDate && item.followUpDate <= startOfToday) {
      needsFollowUp.push(item);
    } else if (item.followUpDate && item.followUpDate > startOfToday) {
      upcoming.push(item);
    } else {
      open.push(item);
    }
  }

  // Sort each group by followUpDate ASC (nulls last), then createdAt DESC
  const sortGroup = (a: (typeof items)[0], b: (typeof items)[0]) => {
    if (a.followUpDate && b.followUpDate) {
      return a.followUpDate.getTime() - b.followUpDate.getTime();
    }
    if (a.followUpDate && !b.followUpDate) return -1;
    if (!a.followUpDate && b.followUpDate) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  };

  needsFollowUp.sort(sortGroup);
  upcoming.sort(sortGroup);
  open.sort(sortGroup);
  resolvedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const sorted = [...needsFollowUp, ...upcoming, ...open, ...resolvedItems];

  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createWaitingForSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const item = await prisma.waitingFor.create({
    data: {
      description: parsed.data.description,
      person: parsed.data.person,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : undefined,
      userId,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
