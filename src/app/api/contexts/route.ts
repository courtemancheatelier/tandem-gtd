import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createContextSchema } from "@/lib/validations/context";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const contexts = await prisma.context.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(contexts);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createContextSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const context = await prisma.context.create({
    data: {
      ...parsed.data,
      userId,
    },
  });

  return NextResponse.json(context, { status: 201 });
}
