import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { processImport } from "@/lib/import/processor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const { jobId } = await params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return notFound("Import job not found");
  if (job.userId !== userId) return forbidden();

  if (job.status !== "AWAITING_CONFIRM") {
    return badRequest(
      `Cannot confirm import in '${job.status}' status. Expected 'AWAITING_CONFIRM'.`
    );
  }

  // Update preview with any duplicate action overrides from request body
  try {
    const body = await req.json().catch(() => ({}));
    if (body.preview) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          preview: body.preview as Prisma.InputJsonValue,
        },
      });
    }
  } catch {
    // No body or invalid JSON — use existing preview as-is
  }

  // Mark as processing
  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      confirmedAt: new Date(),
    },
  });

  // Process inline (synchronous for now — can be moved to background job later)
  await processImport(jobId);

  // Return updated job
  const updated = await prisma.importJob.findUniqueOrThrow({
    where: { id: jobId },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    totalItems: updated.totalItems,
    processedItems: updated.processedItems,
    createdItems: updated.createdItems,
    skippedItems: updated.skippedItems,
    errorCount: updated.errorCount,
    errors: updated.errors,
    completedAt: updated.completedAt,
  });
}
