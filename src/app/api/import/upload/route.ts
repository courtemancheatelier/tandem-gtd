import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseTandemJson } from "@/lib/import/parsers/tandem-json";
import { parseTodoistCsv } from "@/lib/import/parsers/todoist-csv";
import { getCsvHeaders } from "@/lib/import/parsers/generic-csv";
import { detectDuplicates } from "@/lib/import/duplicate-detection";
import type { ImportPreview } from "@/lib/import/types";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Check for concurrent imports
  const activeJob = await prisma.importJob.findFirst({
    where: {
      userId,
      status: { in: ["PENDING", "PREVIEWING", "AWAITING_CONFIRM", "PROCESSING"] },
    },
  });
  if (activeJob) {
    return badRequest(
      "You already have an active import. Please complete or cancel it first."
    );
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return badRequest("Invalid form data. Expected multipart/form-data.");
  }

  const source = formData.get("source") as string | null;
  if (!source || !["tandem_json", "todoist_csv", "generic_csv"].includes(source)) {
    return badRequest("Invalid source. Use 'tandem_json', 'todoist_csv', or 'generic_csv'.");
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return badRequest("No file provided.");
  }
  if (file.size > MAX_FILE_SIZE) {
    return badRequest("File too large. Maximum size is 50MB.");
  }

  const content = await file.text();

  // Create the import job
  const job = await prisma.importJob.create({
    data: {
      status: "PREVIEWING",
      source,
      fileName: file.name,
      userId,
    },
  });

  try {
    let preview: ImportPreview;

    if (source === "tandem_json") {
      preview = parseTandemJson(content);
    } else if (source === "todoist_csv") {
      preview = parseTodoistCsv(content);
    } else if (source === "generic_csv") {
      // For generic CSV, return headers so the user can map columns
      const headers = getCsvHeaders(content);

      // Store the raw content temporarily and return headers for mapping
      const updated = await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "AWAITING_CONFIRM",
          // Store raw content in preview temporarily for re-parsing after mapping
          preview: { _rawContent: content, _headers: headers } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({
        id: updated.id,
        status: "AWAITING_MAPPING",
        headers,
        preview: null,
      });
    } else {
      return badRequest(`Source '${source}' is not supported.`);
    }

    // Detect duplicates
    await detectDuplicates(userId, preview);

    // Count total items
    const totalItems =
      preview.tasks.length +
      preview.projects.length +
      preview.contexts.length +
      preview.areas.length +
      preview.goals.length +
      preview.inboxItems.length +
      preview.horizonNotes.length +
      preview.wikiArticles.length +
      preview.waitingFor.length +
      preview.recurringTemplates.length +
      preview.weeklyReviews.length;

    // Update job with preview
    const updated = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "AWAITING_CONFIRM",
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
  } catch (err) {
    // Mark job as failed
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errors: [
          {
            entity: "file",
            index: 0,
            message: err instanceof Error ? err.message : "Failed to parse file",
          },
        ],
      },
    });

    return badRequest(
      err instanceof Error ? err.message : "Failed to parse file"
    );
  }
}
