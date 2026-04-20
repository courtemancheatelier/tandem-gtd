import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { createInputRequestSchema, updateInputRequestSchema } from "@/lib/validations/decision";
import { createInputRequest, updateInputRequest } from "@/lib/services/decision-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createInputRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const inputRequest = await createInputRequest(params.id, userId, parsed.data);
    return NextResponse.json(inputRequest, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only") || error.message.includes("cannot") || error.message.includes("not a team")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}

export async function PATCH(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { params: _params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const { inputRequestId, ...updateFields } = body;
  if (!inputRequestId) {
    return badRequest("inputRequestId is required");
  }

  const parsed = updateInputRequestSchema.safeParse(updateFields);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    // params.id is the decision id, used for context but inputRequestId is the actual target
    const updated = await updateInputRequest(inputRequestId, userId, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
