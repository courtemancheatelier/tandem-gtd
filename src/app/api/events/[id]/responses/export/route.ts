import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound, forbidden } from "@/lib/api/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { getResponsesCsv } = await import("@/lib/services/event-service");

  try {
    const csv = await getResponsesCsv(params.id, userId);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="event-responses.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") return notFound("Event not found");
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
