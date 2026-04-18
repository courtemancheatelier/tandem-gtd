import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createInboxItemSchema } from "@/lib/validations/inbox";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");

  const where: Record<string, unknown> = { userId };

  if (statusParam === "all") {
    // No status filter — return everything
  } else if (statusParam === "PROCESSED") {
    where.status = "PROCESSED";
  } else {
    // Default: unprocessed only
    where.status = "UNPROCESSED";
  }

  const items = await prisma.inboxItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createInboxItemSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { createInboxItem } = await import("@/lib/services/inbox-service");
  const { sourceLabel, ...itemData } = parsed.data;
  const item = await createInboxItem(userId, itemData, {
    actorType: "USER",
    actorId: userId,
    source: auth.isBearerAuth ? "API" : "MANUAL",
    message: sourceLabel ? `Captured via ${sourceLabel}` : undefined,
  });

  return NextResponse.json(item, { status: 201 });
}
