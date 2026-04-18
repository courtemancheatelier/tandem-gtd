import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { resolveAIConfig, incrementAIUsage, checkAILimit } from "@/lib/ai/resolve-key";
import { buildGTDContext } from "@/lib/ai/gtd-context";
import { buildSystemPrompt } from "@/lib/ai/system-prompts";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1, "At least one message is required"),
  context: z.string().optional(),
});

/**
 * POST /api/ai/chat
 *
 * Streaming chat endpoint for the embedded AI assistant.
 * Resolves AI config, builds system prompt with GTD context,
 * and streams the response back as text/event-stream.
 *
 * Auth: session + Bearer (write scope)
 *
 * Body:
 *   messages: Array<{ role: "user" | "assistant", content: string }>
 *   context?: string  - Optional additional context to include
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Check server-level in-app AI setting
  const serverSettings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { serverInAppAiEnabled: true },
  });
  if (serverSettings && !serverSettings.serverInAppAiEnabled) {
    return NextResponse.json(
      { error: "In-app AI is disabled by your administrator." },
      { status: 403 }
    );
  }

  // Check if user has in-app AI enabled
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inAppAiEnabled: true, inAppAiChatEnabled: true },
  });
  if (!user?.inAppAiEnabled || !user?.inAppAiChatEnabled) {
    return NextResponse.json(
      { error: "In-app AI is disabled. Enable it in Settings." },
      { status: 403 }
    );
  }

  // Rate limit: 20 requests per minute per user
  const rateLimited = checkRateLimit(`ai-chat:${userId}`, 20, 60_000);
  if (rateLimited) return rateLimited;

  // Check daily limit
  const withinLimit = await checkAILimit(userId);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Daily AI message limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  // Resolve AI configuration (key + model)
  const config = await resolveAIConfig(userId);
  if (!config) {
    return NextResponse.json(
      { error: "AI features are not available. Please configure an API key in Settings." },
      { status: 403 }
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { messages, context } = parsed.data;

  // Build system prompt — review mode gets a specialized prompt
  let systemPrompt: string;

  if (context?.startsWith("REVIEW_MODE:")) {
    const phase = context.split(":")[1] as "getClear" | "getCurrent" | "getCreative" | "summary";
    const { getReviewSummaryData } = await import("@/lib/ai/review-data");
    const reviewData = await getReviewSummaryData(userId);
    const { buildReviewSystemPrompt } = await import("@/lib/ai/review-prompts");
    systemPrompt = buildReviewSystemPrompt(phase, reviewData);
  } else {
    const gtdContext = await buildGTDContext(userId);
    systemPrompt = buildSystemPrompt(gtdContext);
    if (context) {
      systemPrompt += `\n\nAdditional context from the user:\n${context}`;
    }
  }

  // Increment usage counter
  await incrementAIUsage(userId);

  // Make streaming request to Anthropic API
  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model || "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      let errorMessage = "Failed to get response from AI";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // Use default error message
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: anthropicResponse.status }
      );
    }

    if (!anthropicResponse.body) {
      return NextResponse.json(
        { error: "No response body from AI" },
        { status: 502 }
      );
    }

    // Pipe the SSE stream back to the client
    const stream = new ReadableStream({
      async start(controller) {
        const reader = anthropicResponse.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            // Forward the raw SSE bytes to the client
            controller.enqueue(value);

            // Also decode to check for errors in the stream
            const chunk = decoder.decode(value, { stream: true });
            if (chunk.includes('"type":"error"')) {
              // Let the error event pass through; client will handle it
            }
          }
        } catch (error) {
          void error;
          // If the stream errors, send a fixed error event and close
          const errorEvent = `event: error\ndata: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    void error;
    return NextResponse.json(
      { error: "Failed to connect to AI service" },
      { status: 502 }
    );
  }
}
