import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  await prisma.trialInterest.upsert({
    where: { email },
    update: {
      userId: userId ?? undefined,
      source: "trial-ended",
    },
    create: {
      email,
      userId,
      source: "trial-ended",
    },
  });

  return NextResponse.json({ ok: true });
}
