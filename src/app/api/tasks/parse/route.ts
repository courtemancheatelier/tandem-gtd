import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createTask } from "@/lib/services/task-service";
import { parseNaturalLanguageTask } from "@/lib/parsers/natural-language-task";
import { z } from "zod";

const parseTaskSchema = z.object({
  text: z.string().min(1).max(500),
  autoCreate: z.boolean().optional().default(true),
});

/**
 * POST /api/tasks/parse
 *
 * Parse natural language text into structured task fields.
 * Supports dates, @context, ~duration, !energy, #project markers.
 *
 * If autoCreate is true (default), creates the task and returns it.
 * If autoCreate is false, returns the parsed fields without creating.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = parseTaskSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { text, autoCreate } = parsed.data;

  // Fetch user's contexts and active projects for matching
  const [contexts, projects] = await Promise.all([
    prisma.context.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true, title: true },
    }),
  ]);

  const result = parseNaturalLanguageTask(text, { contexts, projects });

  if (!autoCreate) {
    return NextResponse.json({ parsed: result });
  }

  // Create the task
  try {
    const task = await createTask(
      userId,
      {
        title: result.title,
        ...(result.dueDate ? { dueDate: result.dueDate } : {}),
        ...(result.scheduledDate ? { scheduledDate: result.scheduledDate } : {}),
        ...(result.contextId ? { contextId: result.contextId } : {}),
        ...(result.estimatedMins ? { estimatedMins: result.estimatedMins } : {}),
        ...(result.energyLevel ? { energyLevel: result.energyLevel } : {}),
        ...(result.projectId ? { projectId: result.projectId } : {}),
      },
      {
        actorType: "USER",
        actorId: userId,
        source: "API",
      }
    );

    return NextResponse.json(
      {
        task,
        parsed: {
          originalText: text,
          extractedFields: Object.keys(result.confidence),
          confidence: result.confidence,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return badRequest("Project not found");
    }
    throw error;
  }
}
