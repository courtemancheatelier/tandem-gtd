import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const existing = await prisma.emailSubscriber.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (existing) {
    return NextResponse.json({ ok: true, message: "You're already on the list!" });
  }

  await prisma.emailSubscriber.create({
    data: { email: parsed.data.email.toLowerCase() },
  });

  return NextResponse.json({ ok: true, message: "You're on the list! We'll notify you when Tandem launches." });
}
