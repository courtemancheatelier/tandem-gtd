import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { importMappingSchema } from "@/lib/validations/import-export";
import { parseGenericCsv } from "@/lib/import/parsers/generic-csv";
import { detectDuplicates } from "@/lib/import/duplicate-detection";

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
  if (job.source !== "generic_csv") {
    return badRequest("Column mapping is only for generic CSV imports.");
  }

  const body = await req.json();
  const parsed = importMappingSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { mapping } = parsed.data;

  // Get the stored raw content from preview
  const storedPreview = job.preview as unknown as Record<string, unknown> | null;
  const rawContent = storedPreview?._rawContent as string | undefined;
  if (!rawContent) {
    return badRequest("No CSV content found. Please re-upload the file.");
  }

  // Parse with mapping
  const preview = parseGenericCsv(rawContent, mapping);
  await detectDuplicates(userId, preview);

  const totalItems =
    preview.tasks.length +
    preview.projects.length +
    preview.contexts.length;

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: "AWAITING_CONFIRM",
      mapping: mapping as unknown as Prisma.InputJsonValue,
      preview: preview as unknown as Prisma.InputJsonValue,
      totalItems,
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    totalItems,
    preview,
  });
}
