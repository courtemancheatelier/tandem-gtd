import { NextRequest, NextResponse } from "next/server";
import { runRetention } from "@/lib/services/retention-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runRetention({ dryRun: false });
  return NextResponse.json(result);
}
