import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { resolveDecisionSchema } from "@/lib/validations/decision";
import { getDecision, resolveDecision, withdrawDecision } from "@/lib/services/decision-service";
import { assertThreadAccess } from "@/lib/services/thread-service";
import { prisma } from "@/lib/prisma";

async function assertDecisionAccess(decisionId: string, userId: string) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    select: { threadId: true },
  });
  if (!decision) throw new Error("Decision not found");
  await assertThreadAccess(decision.threadId, userId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  try {
    await assertDecisionAccess(params.id, auth.userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Decision not found") return notFound("Decision not found");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const decision = await getDecision(params.id);
  if (!decision) return notFound("Decision not found");

  return NextResponse.json(decision);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    await assertDecisionAccess(params.id, userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Decision not found") return notFound("Decision not found");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Withdraw
  if (body.withdraw === true) {
    try {
      await withdrawDecision(params.id, userId, {
        actorType: "USER",
        actorId: userId,
        source: "TEAM_SYNC",
      });
      return NextResponse.json({ success: true, withdrawn: true });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Decision not found") return notFound("Decision not found");
        if (error.message.includes("Only the requester")) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
      }
      throw error;
    }
  }

  // Resolve
  const parsed = resolveDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const decision = await resolveDecision(params.id, userId, parsed.data.resolution, {
      actorType: "USER",
      actorId: userId,
      source: "TEAM_SYNC",
    }, parsed.data.chosenOptionId);
    return NextResponse.json(decision);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Decision not found") return notFound("Decision not found");
      if (error.message.includes("Only the requester") || error.message.includes("not open")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
