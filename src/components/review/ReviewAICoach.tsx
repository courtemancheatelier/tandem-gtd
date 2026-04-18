"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bot, Trash2 } from "lucide-react";
import { ChatMessage, TypingIndicator, type Message } from "@/components/ai/ChatMessage";
import { ChatInput } from "@/components/ai/ChatInput";
import { parseSSEEvents } from "@/lib/ai/parse-sse";

interface ReviewAICoachProps {
  phase: "getClear" | "getCurrent" | "getCreative";
  reviewId: string;
}

const PHASE_LABELS: Record<string, string> = {
  getClear: "Get Clear",
  getCurrent: "Get Current",
  getCreative: "Get Creative",
};

export function ReviewAICoach({ phase, reviewId }: ReviewAICoachProps) {
  void reviewId;
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const phaseRef = React.useRef(phase);

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages, isStreaming]);

  // On phase change: reset conversation and auto-send opening message
  React.useEffect(() => {
    phaseRef.current = phase;

    // Abort any in-flight stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setMessages([]);
    setIsStreaming(false);
    setError(null);

    // Auto-send initial message for this phase
    const initialMessage = `Let's start the ${PHASE_LABELS[phase]} phase of my weekly review.`;

    // Small delay to let state reset before sending
    const timer = setTimeout(() => {
      if (phaseRef.current === phase) {
        sendMessageForPhase(initialMessage, phase, []);
      }
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function sendMessageForPhase(
    content: string,
    targetPhase: string,
    currentMessages: Message[]
  ) {
    setError(null);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    const updatedMessages = [...currentMessages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    const aiMessageId = crypto.randomUUID();
    const aiMessage: Message = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context: `REVIEW_MODE:${targetPhase}`,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || `Request failed (${response.status})`;
        setError(errorMessage);
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        setError("No response body received");
        setIsStreaming(false);
        return;
      }

      setMessages((prev) => [...prev, aiMessage]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const parsed = parseSSEEvents(chunk);

        if (parsed.error) {
          setError(parsed.error);
          break;
        }

        if (parsed.text) {
          accumulatedText += parsed.text;
          const currentText = accumulatedText;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMessageId ? { ...m, content: currentText } : m
            )
          );
        }

        if (parsed.done) break;
      }

      if (!accumulatedText) {
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        if (!error) {
          setError("AI returned an empty response. Please try again.");
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      } else {
        const message =
          err instanceof Error ? err.message : "Failed to send message";
        setError(message);
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  const sendMessage = React.useCallback(
    (content: string) => {
      if (isStreaming) return;
      sendMessageForPhase(content, phase, messages);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming, phase, messages]
  );

  const clearConversation = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages([]);
    setError(null);
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium">AI Review Coach</span>
        </div>
        {hasMessages && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearConversation}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Clear conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Clear conversation</span>
          </Button>
        )}
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isStreaming &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <TypingIndicator />
            )}

          {error && (
            <div className="mx-4 mb-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
