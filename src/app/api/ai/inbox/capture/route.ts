import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { aiInboxCapture, AIPermissionError } from "@/lib/ai/api-layer";
import { z } from "zod";

const captureSchema = z.object({
  items: z.array(z.string().min(1)).min(1, "At least one item is required"),
  source: z.enum(["MCP", "AI_EMBED"]).default("AI_EMBED"),
});

/**
 * POST /api/ai/inbox/capture
 *
 * Captures one or more items into the inbox via AI.
 *
 * Auth: session + Bearer (write scope)
 *
 * Body:
 *   items: string[]  - Array of text items to capture
 *   source: "MCP" | "AI_EMBED"  - Which surface initiated the capture
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = captureSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const items = await aiInboxCapture(userId, parsed.data);
    return NextResponse.json({ items, count: items.length }, { status: 201 });
  } catch (error) {
    if (error instanceof AIPermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    throw error;
  }
}
