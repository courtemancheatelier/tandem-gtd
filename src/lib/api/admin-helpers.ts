import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function requireAdmin(): Promise<
  { userId: string } | NextResponse
> {
  // Use requireAuth to support both session cookies and Bearer tokens (Finding 5.3)
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: auth.userId };
}
