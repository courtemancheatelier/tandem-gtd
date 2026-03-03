import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound, forbidden } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { jobId } = await params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return notFound("Import job not found");
  if (job.userId !== userId) return forbidden();

  return NextResponse.json({
    id: job.id,
    status: job.status,
    source: job.source,
    fileName: job.fileName,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    createdItems: job.createdItems,
    skippedItems: job.skippedItems,
    errorCount: job.errorCount,
    errors: job.errors,
    preview: job.preview,
    confirmedAt: job.confirmedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  });
}
