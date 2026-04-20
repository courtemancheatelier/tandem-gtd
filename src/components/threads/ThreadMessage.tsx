"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Pencil,
  Trash2,
  Check,
  X,
  MoreHorizontal,
  Inbox,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactionBar, type ReactionData } from "./ReactionBar";

interface Reaction {
  id: string;
  emoji: string;
  user: { id: string; name: string };
}

interface ThreadMessageProps {
  message: {
    id: string;
    content: string;
    createdAt: string;
    isEdited: boolean;
    author: { id: string; name: string };
    reactions?: Reaction[];
  };
  threadId: string;
  currentUserId: string;
  isAdmin?: boolean;
  projects?: { id: string; title: string }[];
  contexts?: { id: string; name: string }[];
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onConvert?: (result: { type: "inbox" | "task"; id: string; title?: string }) => void;
  onReactionToggle?: (messageId: string, emoji: string) => void;
}

export function ThreadMessage({
  message,
  threadId,
  currentUserId,
  isAdmin,
  projects = [],
  contexts = [],
  onEdit,
  onDelete,
  onConvert,
  onReactionToggle,
}: ThreadMessageProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [taskProjectId, setTaskProjectId] = useState<string>("");
  const [taskContextId, setTaskContextId] = useState<string>("");
  const [taskIsNextAction, setTaskIsNextAction] = useState(false);

  const canModify = message.author.id === currentUserId || isAdmin;

  const groupedReactions = useMemo((): ReactionData[] => {
    if (!message.reactions?.length) return [];
    const map = new Map<string, { users: { id: string; name: string }[] }>();
    for (const r of message.reactions) {
      const existing = map.get(r.emoji);
      if (existing) {
        existing.users.push(r.user);
      } else {
        map.set(r.emoji, { users: [r.user] });
      }
    }
    return Array.from(map.entries()).map(([emoji, { users }]) => ({
      emoji,
      count: users.length,
      users,
      reacted: users.some((u) => u.id === currentUserId),
    }));
  }, [message.reactions, currentUserId]);

  function handleSave() {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setEditing(false);
  }

  async function handleSendToInbox() {
    setConverting(true);
    try {
      const res = await fetch(
        `/api/threads/${threadId}/messages/${message.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "inbox" }),
        }
      );
      if (!res.ok) throw new Error("Failed to convert");
      const item = await res.json();
      onConvert?.({ type: "inbox", id: item.id });
    } finally {
      setConverting(false);
    }
  }

  async function handleCreateTask() {
    setConverting(true);
    try {
      const res = await fetch(
        `/api/threads/${threadId}/messages/${message.id}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "task",
            ...(taskProjectId ? { projectId: taskProjectId } : {}),
            ...(taskContextId ? { contextId: taskContextId } : {}),
            isNextAction: taskIsNextAction,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to convert");
      const task = await res.json();
      onConvert?.({ type: "task", id: task.id, title: task.title });
    } finally {
      setConverting(false);
      setTaskDialogOpen(false);
      setTaskProjectId("");
      setTaskContextId("");
      setTaskIsNextAction(false);
    }
  }

  return (
    <>
      <div className="group flex gap-3 py-2">
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
          {message.author.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{message.author.name}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {message.isEdited && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}

            {/* Overflow menu */}
            {!editing && (
              <div className={cn("ml-auto opacity-0 group-hover:opacity-100 transition-opacity")}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={handleSendToInbox} disabled={converting}>
                      <Inbox className="h-3.5 w-3.5 mr-2" />
                      Send to Inbox
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTaskDialogOpen(true)} disabled={converting}>
                      <ListTodo className="h-3.5 w-3.5 mr-2" />
                      Create Task...
                    </DropdownMenuItem>
                    {canModify && (onEdit || onDelete) && (
                      <>
                        <DropdownMenuSeparator />
                        {onEdit && (
                          <DropdownMenuItem onClick={() => setEditing(true)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem
                            onClick={() => onDelete(message.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {editing ? (
            <div className="mt-1 space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={2}
                className="text-sm"
                autoFocus
              />
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={handleSave}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setEditing(false); setEditContent(message.content); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap mt-0.5">{message.content}</p>
          )}

          {/* Reactions */}
          {!editing && onReactionToggle && (
            <div className={cn(
              "mt-1",
              message.reactions && message.reactions.length > 0
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 transition-opacity"
            )}>
              <ReactionBar
                reactions={groupedReactions}
                onToggle={(emoji) => onReactionToggle(message.id, emoji)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Create Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Task from Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground line-clamp-2">
              &ldquo;{message.content}&rdquo;
            </p>

            {projects.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Project (optional)</Label>
                <Select value={taskProjectId} onValueChange={setTaskProjectId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {contexts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Context (optional)</Label>
                <Select value={taskContextId} onValueChange={setTaskContextId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="No context" />
                  </SelectTrigger>
                  <SelectContent>
                    {contexts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="next-action"
                checked={taskIsNextAction}
                onCheckedChange={setTaskIsNextAction}
              />
              <Label htmlFor="next-action" className="text-xs">
                Mark as next action
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTaskDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTask} disabled={converting}>
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
