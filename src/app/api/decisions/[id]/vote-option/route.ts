import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { voteOptionSchema } from "@/lib/validations/decision";
import { voteForOption } from "@/lib/services/decision-service";
import { assertThreadAccess } from "@/lib/services/thread-service";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Access check
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: params.id },
    select: { threadId: true },
  });
  if (!decision) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }
  try {
    await assertThreadAccess(decision.threadId, userId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = voteOptionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const vote = await voteForOption(params.id, userId, parsed.data);
    return NextResponse.json(vote);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return badRequest(error.message);
      if (error.message.includes("not a poll") || error.message.includes("not open")) {
        return badRequest(error.message);
      }
      if (error.message.includes("Not a designated")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
