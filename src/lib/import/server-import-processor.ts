import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseTandemJsonData } from "./parsers/tandem-json";
import { processImport } from "./processor";
import type { TandemExport } from "@/lib/export/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServerExportUser {
  email: string;
  name: string | null;
  isAdmin: boolean;
  data: TandemExport["data"];
}

interface ServerExport {
  version: number;
  exportedAt: string;
  serverSettings: unknown;
  users: ServerExportUser[];
}

export interface UserImportResult {
  email: string;
  status: "created" | "skipped" | "error";
  tempPassword?: string;
  createdItems?: number;
  skippedItems?: number;
  errorCount?: number;
  error?: string;
}

export interface ServerImportResult {
  totalUsers: number;
  createdUsers: number;
  skippedUsers: number;
  errorUsers: number;
  users: UserImportResult[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function processServerImport(
  content: string
): Promise<ServerImportResult> {
  // Parse the server export JSON
  let serverExport: ServerExport;
  try {
    serverExport = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON file");
  }

  // Validate top-level structure
  const serverExportSchema = z.object({
    version: z.literal(1, "Unsupported export version. Expected version 1."),
    exportedAt: z.string().optional(),
    serverSettings: z.unknown().optional(),
    users: z.array(z.object({
      email: z.string().email("Invalid email in user data"),
      name: z.string().nullable().optional(),
      isAdmin: z.boolean().optional(),
      data: z.record(z.string(), z.unknown()),
    })),
  });

  const validated = serverExportSchema.safeParse(serverExport);
  if (!validated.success) {
    throw new Error(`Invalid server export: ${validated.error.issues[0]?.message || "validation failed"}`);
  }

  const result: ServerImportResult = {
    totalUsers: serverExport.users.length,
    createdUsers: 0,
    skippedUsers: 0,
    errorUsers: 0,
    users: [],
  };

  for (const exportUser of serverExport.users) {
    try {
      // Check if user already exists
      const existing = await prisma.user.findUnique({
        where: { email: exportUser.email },
        select: { id: true },
      });

      if (existing) {
        result.skippedUsers++;
        result.users.push({ email: exportUser.email, status: "skipped" });
        continue;
      }

      // Create the user with a random temporary password
      const tempPassword = randomBytes(8).toString("hex"); // 16-char hex
      const hashedPassword = bcrypt.hashSync(tempPassword, 10);

      const user = await prisma.user.create({
        data: {
          name: exportUser.name || exportUser.email.split("@")[0],
          email: exportUser.email,
          password: hashedPassword,
          isAdmin: exportUser.isAdmin ?? false,
          tier: "BETA",
        },
      });

      // Build an ImportPreview from the user's data
      const preview = parseTandemJsonData(exportUser.data);

      // Count total items for the job
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

      // Create an ImportJob for this user
      const job = await prisma.importJob.create({
        data: {
          userId: user.id,
          source: "tandem_json",
          fileName: `server-import-${exportUser.email}`,
          totalItems,
          preview: preview as unknown as Prisma.InputJsonValue,
          confirmedAt: new Date(),
        },
      });

      // Run the existing import processor
      await processImport(job.id);

      // Read back the completed job for stats
      const completedJob = await prisma.importJob.findUnique({
        where: { id: job.id },
        select: { createdItems: true, skippedItems: true, errorCount: true },
      });

      result.createdUsers++;
      result.users.push({
        email: exportUser.email,
        status: "created",
        tempPassword,
        createdItems: completedJob?.createdItems ?? 0,
        skippedItems: completedJob?.skippedItems ?? 0,
        errorCount: completedJob?.errorCount ?? 0,
      });
    } catch (err) {
      result.errorUsers++;
      result.users.push({
        email: exportUser.email,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
