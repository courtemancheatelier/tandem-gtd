import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { prisma } from "@/lib/prisma";
import {
  getRetentionSettings,
  findEligibleTrees,
  findPurgeable,
  runRetention,
} from "@/lib/services/retention-service";

/**
 * GET /api/admin/retention — Status: settings, pending purges, eligible trees, recent logs
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const [settings, eligible, purgeable, recentLogs] = await Promise.all([
    getRetentionSettings(),
    getRetentionSettings().then((s) => (s.retentionEnabled ? findEligibleTrees(s) : [])),
    findPurgeable(),
    prisma.retentionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    settings,
    eligibleCount: eligible.length,
    eligible: eligible.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      completedAt: p.completedAt,
    })),
    pendingPurgeCount: purgeable.length,
    pendingPurges: purgeable.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
    })),
    recentLogs,
  });
}

/**
 * POST /api/admin/retention — Manual run: { dryRun?, batchSize?, projectId? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  const batchSize = typeof body.batchSize === "number" && body.batchSize > 0
    ? Math.min(body.batchSize, 100)
    : undefined;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;

  const result = await runRetention({ dryRun, batchSize, projectId });
  return NextResponse.json(result);
}
