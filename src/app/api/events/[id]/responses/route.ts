import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound, forbidden } from "@/lib/api/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { getResponses } = await import("@/lib/services/event-service");

  try {
    const responses = await getResponses(params.id, userId);
    return NextResponse.json(responses);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") return notFound("Event not found");
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
