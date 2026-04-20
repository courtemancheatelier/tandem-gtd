import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Find all unresolved threads where this user was mentioned
  const mentions = await prisma.threadMention.findMany({
    where: { userId },
    select: { threadId: true },
    distinct: ["threadId"],
  });

  if (mentions.length === 0) {
    return NextResponse.json([]);
  }

  const threadIds = mentions.map((m) => m.threadId);

  const threads = await prisma.thread.findMany({
    where: {
      id: { in: threadIds },
      isResolved: false,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      task: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              title: true,
              team: { select: { id: true, name: true, icon: true } },
            },
          },
        },
      },
      project: {
        select: {
          id: true,
          title: true,
          team: { select: { id: true, name: true, icon: true } },
        },
      },
      messages: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(threads);
}
