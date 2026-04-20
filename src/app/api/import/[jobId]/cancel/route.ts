import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";

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

  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return badRequest(`Import is already ${job.status.toLowerCase()}.`);
  }

  if (job.status === "PROCESSING") {
    return badRequest("Cannot cancel an import that is currently processing.");
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ id: jobId, status: "CANCELLED" });
}
