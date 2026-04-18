"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ThreadPanel } from "./ThreadPanel";
import { NewThreadDialog } from "./NewThreadDialog";
import { useToast } from "@/components/ui/use-toast";
import {
  MessageSquare,
  Plus,
  HelpCircle,
  AlertTriangle,
  ArrowUpRight,
  Info,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  _count?: { messages: number };
}

interface ThreadListProps {
  taskId?: string;
  projectId?: string;
  currentUserId: string;
  members: { id: string; name: string }[];
  isAdmin?: boolean;
  projects?: { id: string; title: string }[];
  contexts?: { id: string; name: string }[];
}

export function ThreadList({
  taskId,
  projectId,
  currentUserId,
  members,
  isAdmin,
  projects,
  contexts,
}: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadData[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadData | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const anchorUrl = taskId
    ? `/api/tasks/${taskId}/threads`
    : `/api/projects/${projectId}/threads`;

  const fetchThreads = useCallback(async () => {
    const url = `${anchorUrl}${showResolved ? "?includeResolved=true" : ""}`;
    const res = await fetch(url);
    if (res.ok) {
      setThreads(await res.json());
    }
    setLoading(false);
  }, [anchorUrl, showResolved]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  async function handleCreateThread(data: {
    purpose: string;
    title: string;
    message: string;
    mentions: string[];
    setTaskWaiting?: boolean;
  }) {
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        taskId,
        projectId,
      }),
    });
    if (res.ok) {
      setShowNew(false);
      await fetchThreads();
      toast({ title: "Thread created" });
    }
  }

  async function handleResolve(threadId: string) {
    const res = await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: true }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelectedThread(updated);
      await fetchThreads();
    }
  }

  async function handleReply(threadId: string, content: string, mentions: string[]) {
    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentions }),
    });
    if (res.ok) {
      // Refresh the selected thread
      const threadRes = await fetch(`/api/threads/${threadId}`);
      if (threadRes.ok) {
        setSelectedThread(await threadRes.json());
      }
      await fetchThreads();
    }
  }

  async function handleEditMessage(messageId: string, content: string) {
    if (!selectedThread) return;
    const res = await fetch(`/api/threads/${selectedThread.id}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const threadRes = await fetch(`/api/threads/${selectedThread.id}`);
      if (threadRes.ok) setSelectedThread(await threadRes.json());
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selectedThread) return;
    const res = await fetch(`/api/threads/${selectedThread.id}/messages/${messageId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const threadRes = await fetch(`/api/threads/${selectedThread.id}`);
      if (threadRes.ok) setSelectedThread(await threadRes.json());
    }
  }

  async function handleReactionToggle(messageId: string, emoji: string) {
    if (!selectedThread) return;

    // Optimistic update
    const msg = selectedThread.messages.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find(
      (r) => r.emoji === emoji && r.user.id === currentUserId
    );

    // Optimistically update the local state
    setSelectedThread((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = m.reactions ?? [];
          if (existing) {
            return { ...m, reactions: reactions.filter((r) => r.id !== existing.id) };
          }
          return {
            ...m,
            reactions: [
              ...reactions,
              { id: `optimistic-${Date.now()}`, emoji, user: { id: currentUserId, name: "" } },
            ],
          };
        }),
      };
    });

    const method = existing ? "DELETE" : "POST";
    const res = await fetch(
      `/api/threads/${selectedThread.id}/messages/${messageId}/reactions`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      }
    );

    // Refresh thread to get accurate state
    const threadRes = await fetch(`/api/threads/${selectedThread.id}`);
    if (threadRes.ok) setSelectedThread(await threadRes.json());
    else if (!res.ok) {
      // Revert on failure
      const revertRes = await fetch(`/api/threads/${selectedThread.id}`);
      if (revertRes.ok) setSelectedThread(await revertRes.json());
    }
  }

  // Show thread panel when a thread is selected
  if (selectedThread) {
    return (
      <ThreadPanel
        thread={selectedThread}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        members={members}
        projects={projects}
        contexts={contexts}
        onBack={() => { setSelectedThread(null); fetchThreads(); }}
        onResolve={handleResolve}
        onReply={handleReply}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onReactionToggle={handleReactionToggle}
      />
    );
  }

  const openThreads = threads.filter((t) => !t.isResolved);
  const resolvedThreads = threads.filter((t) => t.isResolved);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            Threads
            {openThreads.length > 0 && (
              <span className="ml-1.5 text-muted-foreground">({openThreads.length})</span>
            )}
          </h3>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowNew(true)}>
          <Plus className="h-3 w-3 mr-1" />
          New Thread
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : openThreads.length === 0 && !showResolved ? (
        <p className="text-xs text-muted-foreground">No open threads</p>
      ) : (
        <div className="space-y-1">
          {openThreads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              onClick={() => setSelectedThread(thread)}
            />
          ))}
        </div>
      )}

      {/* Resolved threads toggle */}
      {resolvedThreads.length > 0 && (
        <div className="mt-3">
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? "Hide" : "Show"} {resolvedThreads.length} resolved
          </button>
          {showResolved && (
            <div className="space-y-1 mt-1">
              {resolvedThreads.map((thread) => (
                <ThreadListItem
                  key={thread.id}
                  thread={thread}
                  onClick={() => setSelectedThread(thread)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <NewThreadDialog
        open={showNew}
        onOpenChange={setShowNew}
        onSubmit={handleCreateThread}
        members={members}
        currentUserId={currentUserId}
        anchorType={taskId ? "task" : "project"}
      />
    </div>
  );
}

function ThreadListItem({
  thread,
  onClick,
}: {
  thread: ThreadData;
  onClick: () => void;
}) {
  const Icon = PURPOSE_ICONS[thread.purpose] ?? HelpCircle;
  const iconColor = PURPOSE_COLORS[thread.purpose] ?? "text-muted-foreground";
  const messageCount = thread._count?.messages ?? thread.messages.length;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded-md border px-3 py-2 text-left hover:bg-muted/50 transition-colors",
        thread.isResolved && "opacity-60"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
      <span className="text-sm truncate flex-1">{thread.title}</span>
      {thread.isResolved && (
        <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
      )}
      <span className="text-xs text-muted-foreground shrink-0">
        {messageCount} {messageCount === 1 ? "msg" : "msgs"}
      </span>
    </button>
  );
}
