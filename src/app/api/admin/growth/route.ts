import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Tier breakdown
  const tierBreakdown = await prisma.user.groupBy({
    by: ["tier"],
    _count: { id: true },
  });

  // Invite code stats
  const totalCodes = await prisma.inviteCode.count();
  const usedCodes = await prisma.inviteCode.count({
    where: { usedById: { not: null } },
  });

  // Top referrers
  const topReferrers = await prisma.user.findMany({
    where: { invitees: { some: {} } },
    select: {
      id: true,
      name: true,
      email: true,
      _count: { select: { invitees: true } },
    },
    orderBy: { invitees: { _count: "desc" } },
    take: 10,
  });

  // Signups per week (last 12 weeks)
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const recentUsers = await prisma.user.findMany({
    where: { createdAt: { gte: twelveWeeksAgo } },
    select: { createdAt: true, tier: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by week
  const weeklySignups: Record<string, Record<string, number>> = {};
  for (const u of recentUsers) {
    const date = new Date(u.createdAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = weekStart.toISOString().split("T")[0];
    if (!weeklySignups[key]) weeklySignups[key] = {};
    weeklySignups[key][u.tier] = (weeklySignups[key][u.tier] || 0) + 1;
  }

  return NextResponse.json({
    tierBreakdown: tierBreakdown.map((t) => ({
      tier: t.tier,
      count: t._count.id,
    })),
    inviteCodes: {
      total: totalCodes,
      used: usedCodes,
      remaining: totalCodes - usedCodes,
    },
    topReferrers: topReferrers.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      inviteeCount: r._count.invitees,
    })),
    weeklySignups: Object.entries(weeklySignups).map(([week, tiers]) => ({
      week,
      ...tiers,
    })),
  });
}
