import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { retryFailedSyncs } from "@/lib/google-calendar/sync-write";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const retriedCount = await retryFailedSyncs(userId);
    return NextResponse.json({ success: true, retriedCount });
  } catch (err) {
    console.error("[google-calendar] Manual sync retry failed:", err);
    return NextResponse.json(
      { error: "Sync retry failed" },
      { status: 500 }
    );
  }
}
