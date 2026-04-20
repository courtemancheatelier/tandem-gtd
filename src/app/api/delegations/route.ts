import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createDelegationSchema } from "@/lib/validations/delegation";
import { createDelegation } from "@/lib/services/delegation-service";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createDelegationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const result = await createDelegation(
      parsed.data.taskId,
      userId,
      parsed.data.delegateeId,
      parsed.data.landingZone,
      parsed.data.note
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction") || "given";

  const where =
    direction === "received"
      ? { delegateeId: userId }
      : { delegatorId: userId };

  const delegations = await prisma.delegation.findMany({
    where,
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          projectId: true,
          project: { select: { id: true, title: true } },
        },
      },
      delegator: { select: { id: true, name: true, email: true } },
      delegatee: { select: { id: true, name: true, email: true } },
      waitingFor: { select: { id: true, isResolved: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  return NextResponse.json(delegations);
}
