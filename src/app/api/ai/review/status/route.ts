import { NextResponse } from "next/server";
import { getCurrentUserId, unauthorized } from "@/lib/api/auth-helpers";
import { aiReviewStatus, AIPermissionError } from "@/lib/ai/api-layer";

/**
 * GET /api/ai/review/status
 *
 * Returns the weekly review status: last review date, days since,
 * and whether the review is overdue (>7 days).
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  try {
    const status = await aiReviewStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof AIPermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    throw error;
  }
}
