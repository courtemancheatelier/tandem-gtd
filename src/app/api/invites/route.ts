import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInviteCode } from "@/lib/invite-codes";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const codes = await prisma.inviteCode.findMany({
    where: { createdById: session.user.id },
    include: {
      usedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(codes);
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check invite code limit
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { maxInviteCodesPerUser: true },
  });
  const maxCodes = settings?.maxInviteCodesPerUser ?? 2;

  const existingCount = await prisma.inviteCode.count({
    where: { createdById: session.user.id },
  });

  if (existingCount >= maxCodes) {
    return NextResponse.json(
      { error: `You can only create ${maxCodes} invite codes` },
      { status: 400 }
    );
  }

  // Generate a unique code (retry on collision)
  let code: string;
  let attempts = 0;
  do {
    code = generateInviteCode();
    const existing = await prisma.inviteCode.findUnique({ where: { code } });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    return NextResponse.json(
      { error: "Failed to generate unique code" },
      { status: 500 }
    );
  }

  const inviteCode = await prisma.inviteCode.create({
    data: {
      code,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(inviteCode, { status: 201 });
}
