"use client";

import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  MessageSquare,
  AlertTriangle,
  HelpCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Send,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface ThreadMentionData {
  id: string;
  purpose: string;
  title: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  task?: {
    id: string;
    title: string;
    project?: { id: string; title: string; team?: { id: string; name: string; icon?: string | null } | null } | null;
  } | null;
  project?: {
    id: string;
    title: string;
    team?: { id: string; name: string; icon?: string | null } | null;
  } | null;
  messages: {
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string };
  }[];
  _count: { messages: number };
}

function getPurposeIcon(purpose: string) {
  switch (purpose) {
    case "BLOCKER":
      return AlertTriangle;
    case "QUESTION":
      return HelpCircle;
    case "UPDATE":
      return Info;
    default:
      return MessageSquare;
  }
}

function getPurposeColor(purpose: string) {
  switch (purpose) {
    case "BLOCKER":
      return "text-destructive";
    case "QUESTION":
      return "text-blue-500";
    case "UPDATE":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface ThreadMentionItemProps {
  thread: ThreadMentionData;
  onReplied?: () => void;
}

export function ThreadMentionItem({ thread, onReplied }: ThreadMentionItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const PurposeIcon = getPurposeIcon(thread.purpose);
  const purposeColor = getPurposeColor(thread.purpose);

  const teamName = thread.task?.project?.team?.name
    ?? thread.project?.team?.name
    ?? "Team";
  const anchorTitle = thread.task?.title ?? thread.project?.title ?? "";
  const anchorLink = thread.task
    ? `/tasks/${thread.task.id}`
    : thread.project
      ? `/projects/${thread.project.id}`
      : null;

  // Show last 5 messages when expanded
  const displayMessages = thread.messages.slice(-5);

  async function handleSendReply() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (res.ok) {
        setReply("");
        toast({ title: "Reply sent" });
        onReplied?.();
      } else {
        toast({ title: "Error", description: "Failed to send reply", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendReply();
    }
  }

  return (
    <div className="rounded-lg border">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <PurposeIcon className={`h-5 w-5 mt-0.5 shrink-0 ${purposeColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{thread.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{teamName}</span>
            {anchorTitle && (
              <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                {anchorTitle}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              by {thread.createdBy.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
            {thread._count.messages}
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded: messages + reply */}
      {expanded && (
        <div className="border-t px-3 py-2.5 space-y-3">
          {/* Messages */}
          <div className="space-y-2">
            {thread._count.messages > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                {thread._count.messages - 5} earlier message{thread._count.messages - 5 !== 1 ? "s" : ""} not shown
              </p>
            )}
            {displayMessages.map((msg) => (
              <div key={msg.id} className="text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-xs">{msg.author.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatRelativeTime(msg.createdAt)}</span>
                </div>
                <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>

          {/* Quick reply */}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reply... (Cmd+Enter to send)"
              className="min-h-[60px] text-sm resize-none"
              disabled={sending}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSendReply}
              disabled={!reply.trim() || sending}
              className="shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* View full thread link */}
          {anchorLink && (
            <Link
              href={anchorLink}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View full thread
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
