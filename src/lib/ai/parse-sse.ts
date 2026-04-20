/**
 * SSE Parser for Anthropic Streaming API
 *
 * Parses Server-Sent Events from the Anthropic API to extract text deltas.
 * Shared between AIChatPanel and ReviewAICoach.
 *
 * The Anthropic API sends events like:
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
 *
 *   event: message_stop
 *   data: {"type":"message_stop"}
 */
export function parseSSEEvents(
  chunk: string
): { text: string; done: boolean; error?: string } {
  let text = "";
  let done = false;
  let error: string | undefined;

  const lines = chunk.split("\n");
  let currentEvent = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
      continue;
    }

    if (line.startsWith("data: ")) {
      const data = line.slice(6);

      try {
        const parsed = JSON.parse(data);

        if (currentEvent === "content_block_delta" || parsed.type === "content_block_delta") {
          if (parsed.delta?.type === "text_delta" && parsed.delta.text) {
            text += parsed.delta.text;
          }
        }

        if (
          currentEvent === "message_stop" ||
          parsed.type === "message_stop"
        ) {
          done = true;
        }

        if (currentEvent === "error" || parsed.type === "error") {
          error = parsed.error?.message || parsed.message || "Unknown streaming error";
          done = true;
        }
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  return { text, done, error };
}
