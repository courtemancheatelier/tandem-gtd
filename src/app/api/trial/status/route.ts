import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isTrial: true,
      trialStartedAt: true,
      trialExpiresAt: true,
      _count: {
        select: {
          projects: true,
          tasks: true,
          inboxItems: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const daysUsed = user.trialStartedAt
    ? Math.floor(
        (Date.now() - new Date(user.trialStartedAt).getTime()) / 86400000
      )
    : 0;

  return NextResponse.json({
    isTrial: user.isTrial,
    trialStartedAt: user.trialStartedAt?.toISOString() ?? null,
    trialExpiresAt: user.trialExpiresAt?.toISOString() ?? null,
    daysUsed,
    stats: {
      projects: user._count.projects,
      tasks: user._count.tasks,
      inboxItems: user._count.inboxItems,
    },
  });
}
