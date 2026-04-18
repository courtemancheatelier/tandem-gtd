"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThreadMessage } from "./ThreadMessage";
import { MentionPicker } from "./MentionPicker";
import {
  HelpCircle,
  AlertTriangle,
  ArrowUpRight,
  Info,
  CheckCircle,
  ArrowLeft,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

const PURPOSE_ICONS: Record<string, typeof HelpCircle> = {
  QUESTION: HelpCircle,
  BLOCKER: AlertTriangle,
  UPDATE: ArrowUpRight,
  FYI: Info,
};

const PURPOSE_COLORS: Record<string, string> = {
  QUESTION: "text-blue-500",
  BLOCKER: "text-red-500",
  UPDATE: "text-green-500",
  FYI: "text-muted-foreground",
};

interface ThreadData {
  id: string;
  purpose: string;
  title: string;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  resolvedBy?: { id: string; name: string } | null;
  messages: {
    id: string;
    content: string;
    createdAt: string;
    isEdited: boolean;
    author: { id: string; name: string };
    reactions?: {
      id: string;
      emoji: string;
      user: { id: string; name: string };
    }[];
  }[];
}

interface ThreadPanelProps {
  thread: ThreadData;
  currentUserId: string;
  isAdmin?: boolean;
  members?: { id: string; name: string }[];
  projects?: { id: string; title: string }[];
  contexts?: { id: string; name: string }[];
  onBack: () => void;
  onResolve: (threadId: string) => void;
  onReply: (threadId: string, content: string, mentions: string[]) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReactionToggle?: (messageId: string, emoji: string) => void;
}

export function ThreadPanel({
  thread,
  currentUserId,
  isAdmin,
  members = [],
  projects = [],
  contexts = [],
  onBack,
  onResolve,
  onReply,
  onEditMessage,
  onDeleteMessage,
  onReactionToggle,
}: ThreadPanelProps) {
  const [replyContent, setReplyContent] = useState("");
  const [replyMentions, setReplyMentions] = useState<string[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Check if AI is enabled for this user
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/settings/ai");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAiEnabled(
            data.serverInAppAiEnabled !== false &&
            data.inAppAiEnabled !== false &&
            (data.serverAiEnabled !== false || data.aiEnabled === true)
          );
        }
      } catch {
        // AI not available
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const handleSummarize = useCallback(async () => {
    if (summarizing) return;
    setSummarizing(true);
    setSummary("");
    setSummaryError(null);
    setSummaryExpanded(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/threads/${thread.id}/summarize`, {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setSummaryError(data.error || "Failed to summarize thread");
        setSummarizing(false);
        return;
      }

      if (!res.body) {
        setSummaryError("No response from AI");
        setSummarizing(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                accumulated += parsed.delta.text;
                setSummary(accumulated);
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setSummaryError("Failed to summarize thread");
      }
    } finally {
      setSummarizing(false);
      abortRef.current = null;
    }
  }, [thread.id, summarizing]);

  const Icon = PURPOSE_ICONS[thread.purpose] ?? HelpCircle;
  const iconColor = PURPOSE_COLORS[thread.purpose] ?? "text-muted-foreground";

  function handleReply() {
    if (!replyContent.trim()) return;
    onReply(thread.id, replyContent.trim(), replyMentions);
    setReplyContent("");
    setReplyMentions([]);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <h3 className="text-sm font-medium truncate flex-1">{thread.title}</h3>
        {aiEnabled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5"
            onClick={handleSummarize}
            disabled={summarizing}
            title="Summarize thread"
          >
            {summarizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        )}
        {thread.isResolved ? (
          <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600">
            <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
            Resolved
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            {thread.purpose}
          </Badge>
        )}
      </div>

      {/* AI Summary */}
      {(summary || summaryError) && (
        <div className="border rounded-md bg-muted/50 mx-0 mt-2">
          <button
            className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setSummaryExpanded((v) => !v)}
          >
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI Summary
            </span>
            <span className="flex items-center gap-1">
              {!summarizing && (
                <button
                  className="p-0.5 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSummarize();
                  }}
                  title="Regenerate summary"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
              {summaryExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </span>
          </button>
          {summaryExpanded && (
            <div className="px-3 pb-2 text-xs prose prose-sm dark:prose-invert max-w-none">
              {summaryError ? (
                <p className="text-destructive">{summaryError}</p>
              ) : (
                <div className="whitespace-pre-wrap">{summary}</div>
              )}
              {summarizing && (
                <span className="inline-block w-1.5 h-3.5 bg-foreground/70 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        {thread.messages.map((msg) => (
          <ThreadMessage
            key={msg.id}
            message={msg}
            threadId={thread.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            projects={projects}
            contexts={contexts}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onConvert={(result) => {
              if (result.type === "inbox") {
                toast({
                  title: "Sent to Inbox",
                  description: "Message added to your inbox.",
                });
              } else {
                toast({
                  title: "Task Created",
                  description: result.title
                    ? `"${result.title.slice(0, 60)}${result.title.length > 60 ? "..." : ""}" created.`
                    : "Task created from message.",
                });
              }
            }}
            onReactionToggle={onReactionToggle}
          />
        ))}

        {thread.isResolved && thread.resolvedBy && (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-green-500" />
            Resolved by {thread.resolvedBy.name}
            {thread.resolvedAt && (
              <span>
                {" "}on{" "}
                {new Date(thread.resolvedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="border-t pt-3 space-y-2">
        <Textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Reply..."
          rows={2}
          className="text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleReply();
            }
          }}
        />
        {members.length > 1 && (
          <MentionPicker
            members={members}
            selected={replyMentions}
            onChange={setReplyMentions}
            currentUserId={currentUserId}
          />
        )}
        <div className="flex justify-between items-center">
          {!thread.isResolved ? (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onResolve(thread.id)}>
              <CheckCircle className="h-3 w-3 mr-1" />
              Resolve
            </Button>
          ) : (
            <div />
          )}
          <Button size="sm" onClick={handleReply} disabled={!replyContent.trim()}>
            <Send className="h-3 w-3 mr-1" />
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
