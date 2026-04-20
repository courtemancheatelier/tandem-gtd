import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { InboxItemStatus } from "@prisma/client";

export async function GET() {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!process.env.TANDEM_ADMIN_API_TOKEN) {
    return NextResponse.json(
      { error: "Admin API not configured" },
      { status: 503 }
    );
  }

  if (!token || token.length !== process.env.TANDEM_ADMIN_API_TOKEN.length) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const isValid = crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(process.env.TANDEM_ADMIN_API_TOKEN)
  );

  if (!isValid) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const trialUsers = await prisma.user.findMany({
    where: {
      isTrial: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      trialStartedAt: true,
      trialExpiresAt: true,
      loginCount: true,
      lastLoginAt: true,
      cascadeEventCount: true,
      lastWhatNowAt: true,
      _count: {
        select: {
          tasks: true,
          projects: true,
        },
      },
      inboxItems: {
        where: { status: InboxItemStatus.PROCESSED },
        select: { id: true },
      },
    },
  });

  const response = {
    polledAt: new Date().toISOString(),
    trialUsers: trialUsers.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      trialStartedAt: user.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: user.trialExpiresAt?.toISOString() ?? null,

      loginCount: user.loginCount,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,

      // Behavioral signals
      hasCreatedTask: user._count.tasks > 0,
      hasCreatedProject: user._count.projects > 0,
      hasCascadeTriggered: user.cascadeEventCount > 0,
      hasUsedInbox: user.inboxItems.length > 0,
      hasUsedWhatNow: user.lastWhatNowAt !== null,
    })),
  };

  return NextResponse.json(response);
}
