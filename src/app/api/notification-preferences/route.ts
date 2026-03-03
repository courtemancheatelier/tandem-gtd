import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { notificationPreferenceUpdateSchema } from "@/lib/validations/notification";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Upsert default preferences if none exist
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = notificationPreferenceUpdateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: parsed.data,
    create: { userId, ...parsed.data },
  });

  return NextResponse.json(prefs);
}
