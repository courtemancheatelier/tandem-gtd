"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bot, Trash2 } from "lucide-react";
import { ChatMessage, TypingIndicator, type Message } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { parseSSEEvents } from "@/lib/ai/parse-sse";

interface AIChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIChatPanel({ open, onOpenChange }: AIChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    if (scrollRef.current) {
      // Small delay to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages, isStreaming]);

  // Keyboard shortcut: Cmd+J / Ctrl+J to toggle panel
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Clear conversation when panel closes
  const handleOpenChange = React.useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // Abort any in-flight stream
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setIsStreaming(false);
        setMessages([]);
        setError(null);
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
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

  const sendMessage = React.useCallback(
    async (content: string) => {
      if (isStreaming) return;

      setError(null);

      // Add user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setIsStreaming(true);

      // Prepare the AI message placeholder
      const aiMessageId = crypto.randomUUID();
      const aiMessage: Message = {
        id: aiMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      // Create abort controller for this request
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

        // Add empty AI message to start streaming into
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
                m.id === aiMessageId
                  ? { ...m, content: currentText }
                  : m
              )
            );
          }

          if (parsed.done) break;
        }

        // If the AI message ended up empty (no text was streamed), remove it
        if (!accumulatedText) {
          setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
          if (!error) {
            setError("AI returned an empty response. Please try again.");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Request was cancelled, remove the empty AI message
          setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        } else {
          const message =
            err instanceof Error ? err.message : "Failed to send message";
          setError(message);
          // Remove the empty AI message on error
          setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [messages, isStreaming, error]
  );

  const hasMessages = messages.length > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <SheetTitle className="text-base">GTD Coach</SheetTitle>
                <SheetDescription className="text-xs">
                  Your AI-powered GTD assistant
                </SheetDescription>
              </div>
            </div>
            {hasMessages && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearConversation}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Clear conversation</span>
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Messages area */}
        <ScrollArea className="flex-1">
          <div ref={scrollRef} className="flex h-full flex-col">
            {!hasMessages && !isStreaming && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">
                    Hi! I&apos;m your GTD coach.
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    I can help you process your inbox, plan tasks, prepare for
                    your weekly review, or answer questions about GTD methodology.
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {isStreaming &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <TypingIndicator />
              )}

            {/* Error display */}
            {error && (
              <div className="mx-4 mb-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          showSuggestions={!hasMessages && !isStreaming}
        />
      </SheetContent>
    </Sheet>
  );
}
