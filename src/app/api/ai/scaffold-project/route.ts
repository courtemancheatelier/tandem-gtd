import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  badRequest,
} from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  resolveAIConfig,
  checkAILimit,
  incrementAIUsage,
} from "@/lib/ai/resolve-key";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getScaffoldSuggestion } from "@/lib/ai/scaffold-ai";
import { z } from "zod";

const scaffoldProjectSchema = z.object({
  projectTitle: z.string().min(1).max(200),
  projectDescription: z.string().max(2000).optional(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
      })
    )
    .min(2)
    .max(50),
});

/**
 * POST /api/ai/scaffold-project
 *
 * AI-powered project scaffolding — suggests task order, types, and dependencies.
 *
 * Auth: session + Bearer (write scope)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Check if user has in-app AI features enabled
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inAppAiEnabled: true, inAppAiFeaturesEnabled: true },
  });
  if (!user?.inAppAiEnabled || !user?.inAppAiFeaturesEnabled) {
    return NextResponse.json(
      { error: "AI features are disabled. Enable them in Settings." },
      { status: 403 }
    );
  }

  // Rate limit: 5 scaffold requests per minute
  const rateLimited = checkRateLimit(`ai-scaffold:${userId}`, 5, 60_000);
  if (rateLimited) return rateLimited;

  const withinLimit = await checkAILimit(userId);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Daily AI limit reached" },
      { status: 429 }
    );
  }

  const config = await resolveAIConfig(userId);
  if (!config) {
    return NextResponse.json({ error: "AI not available" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = scaffoldProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { projectTitle, projectDescription, tasks } = parsed.data;

  // Get user's contexts for matching
  const contexts = await prisma.context.findMany({
    where: { userId },
    select: { name: true },
  });

  try {
    const suggestion = await getScaffoldSuggestion(config, {
      projectTitle,
      projectDescription,
      tasks,
      contexts,
    });

    await incrementAIUsage(userId);

    return NextResponse.json(suggestion);
  } catch {
    return NextResponse.json(
      { error: "AI scaffold failed" },
      { status: 502 }
    );
  }
}
