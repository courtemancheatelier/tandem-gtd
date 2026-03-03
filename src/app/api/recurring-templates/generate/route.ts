import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { processRecurringTemplates } from "@/lib/recurring";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const generated = await processRecurringTemplates(userId);

  return NextResponse.json({
    success: true,
    generated,
    message: generated > 0
      ? `Generated ${generated} task${generated === 1 ? "" : "s"} from recurring templates.`
      : "No recurring tasks were due.",
  });
}
