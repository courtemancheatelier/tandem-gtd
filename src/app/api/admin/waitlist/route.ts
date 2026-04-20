import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const statusParam = req.nextUrl.searchParams.get("status");
  const validStatuses = ["PENDING", "DECLINED"] as const;
  const status = statusParam && validStatuses.includes(statusParam as typeof validStatuses[number])
    ? (statusParam as typeof validStatuses[number])
    : undefined;

  const entries = await prisma.waitlistEntry.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { promotedUser: { select: { id: true, email: true, name: true } } },
  });

  return NextResponse.json(entries);
}
