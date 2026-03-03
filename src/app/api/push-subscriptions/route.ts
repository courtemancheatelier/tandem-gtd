import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { pushSubscriptionSchema } from "@/lib/validations/notification";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const { endpoint, keys, userAgent } = parsed.data;

  const subscription = await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId, endpoint } },
    update: { p256dh: keys.p256dh, auth: keys.auth, userAgent },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });

  return NextResponse.json(subscription, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const endpoint = body?.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    return badRequest("endpoint is required");
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });

  return NextResponse.json({ ok: true });
}
