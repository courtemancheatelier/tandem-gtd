import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";
import { resolveAIConfig, incrementAIUsage, checkAILimit } from "@/lib/ai/resolve-key";
import { checkRateLimit } from "@/lib/api/rate-limit";

/**
 * POST /api/threads/[id]/summarize
 *
 * Streams an AI-generated summary of a thread's conversation.
 * Uses the same auth, key resolution, and streaming pattern as /api/ai/chat.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id: threadId } = await params;

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
    select: { inAppAiEnabled: true },
  });
  if (!user?.inAppAiEnabled) {
    return NextResponse.json(
      { error: "In-app AI is disabled. Enable it in Settings." },
      { status: 403 }
    );
  }

  // Rate limit: 5 requests per minute per user
  const rateLimited = checkRateLimit(`thread-summarize:${userId}`, 5, 60_000);
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

  // Fetch the thread with messages
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
      project: { select: { teamId: true } },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Check user has access via team membership
  if (thread.project?.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: thread.project.teamId, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  if (thread.messages.length === 0) {
    return NextResponse.json(
      { error: "Thread has no messages to summarize." },
      { status: 400 }
    );
  }

  // Build message content from thread
  const formattedMessages = thread.messages
    .map((msg) => {
      const date = new Date(msg.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return `${msg.author.name} (${date}): ${msg.content}`;
    })
    .join("\n\n");

  const threadContext = `Thread: ${thread.title}${thread.purpose ? ` (Purpose: ${thread.purpose})` : ""}\n\n${formattedMessages}`;

  const systemPrompt =
    "You are summarizing a team discussion thread. Extract the key points, decisions made, action items mentioned, and any unresolved questions. Be concise — bullet points preferred. Format as markdown.";

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
        messages: [{ role: "user", content: threadContext }],
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
            controller.enqueue(value);

            const chunk = decoder.decode(value, { stream: true });
            if (chunk.includes('"type":"error"')) {
              // Let the error event pass through; client will handle it
            }
          }
        } catch (error) {
          void error;
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
