import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { upsertHorizonNoteSchema } from "@/lib/validations/horizon-note";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level");

  const where: Record<string, unknown> = { userId };
  if (level) {
    where.level = level;
  }

  const notes = await prisma.horizonNote.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = upsertHorizonNoteSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Upsert: find existing note for this user + level, or create new
  const existing = await prisma.horizonNote.findFirst({
    where: {
      userId,
      level: parsed.data.level,
    },
  });

  let note;
  if (existing) {
    note = await prisma.horizonNote.update({
      where: { id: existing.id },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
      },
    });
  } else {
    note = await prisma.horizonNote.create({
      data: {
        ...parsed.data,
        userId,
      },
    });
  }

  return NextResponse.json(note, { status: existing ? 200 : 201 });
}
