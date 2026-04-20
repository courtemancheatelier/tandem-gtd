"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  Inbox,
  Trash2,
  Loader2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { HelpLink } from "@/components/shared/HelpLink";
import { parseNumberedItems } from "@/lib/parsers/numbered-items";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/shared/PullToRefreshIndicator";

interface InboxItem {
  id: string;
  content: string;
  notes: string | null;
  status: string;
  createdAt: string;
  source: string | null;
  sourceEmail: string | null;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
}

function InboxItemCard({
  item,
  onSave,
  onDelete,
  deleting,
}: {
  item: InboxItem;
  onSave: (id: string, data: { content?: string; notes?: string }) => Promise<void>;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [editNotes, setEditNotes] = useState(item.notes || "");

  function handleContentSave() {
    if (editContent.trim() && editContent.trim() !== item.content) {
      onSave(item.id, { content: editContent.trim() });
    } else {
      setEditContent(item.content);
    }
    setEditingContent(false);
  }

  function handleNotesSave() {
    const trimmed = editNotes.trim();
    if (trimmed !== (item.notes || "")) {
      onSave(item.id, { notes: trimmed || undefined });
    }
  }

  return (
    <div className="rounded-lg border transition-all">
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          {editingContent ? (
            <Input
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={handleContentSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleContentSave();
                if (e.key === "Escape") {
                  setEditContent(item.content);
                  setEditingContent(false);
                }
              }}
              className="h-7 text-sm"
              maxLength={500}
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingContent(true)}
              className="text-sm font-medium text-left hover:underline cursor-pointer"
            >
              {item.content}
            </button>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {item.source === "email" && (
              <span className="text-blue-600 dark:text-blue-400 mr-1.5">
                via email{item.sourceEmail ? ` from ${item.sourceEmail}` : ""}
                {" · "}
              </span>
            )}
            {timeAgo(item.createdAt)}
          </p>
        </div>

        <div className="flex gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(item.id)}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Notes
          </label>
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onBlur={handleNotesSave}
            placeholder="Add notes..."
            rows={3}
            maxLength={5000}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/inbox");
    if (res.ok) {
      setItems(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Poll for new items every 5 seconds so the list updates after quick capture
  useEffect(() => {
    const interval = setInterval(fetchItems, 5000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  async function handleSave(id: string, data: { content?: string; notes?: string }) {
    const res = await fetch(`/api/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const content = newItem.trim();
    if (!content) return;
    setAdding(true);

    // Check for numbered bulk syntax (e.g. "1:Buy groceries 2:Call dentist")
    const numbered = parseNumberedItems(content);
    if (numbered) {
      const created: InboxItem[] = [];
      for (const item of numbered) {
        const res = await fetch("/api/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: item }),
        });
        if (res.ok) created.push(await res.json());
      }
      if (created.length > 0) {
        setItems((prev) => [...created, ...prev]);
        setNewItem("");
        toast({ title: "Captured", description: `${created.length} items added` });
      }
    } else {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const created = await res.json();
        setItems((prev) => [created, ...prev]);
        setNewItem("");
      }
    }

    setAdding(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/inbox/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast({ title: "Item removed" });
    }
    setDeletingId(null);
  }

  const { pullDistance, isRefreshing, isPastThreshold } = usePullToRefresh({
    onRefresh: fetchItems,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        isPastThreshold={isPastThreshold}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6" />
            Inbox
            <HelpLink slug="capture" />
          </h1>
          <p className="text-muted-foreground mt-1">
            {items.length} unprocessed item{items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-col md:items-end gap-1">
          <Link href="/inbox/process" className="w-full md:w-auto">
            <Button size="lg" className="w-full md:w-auto">
              <ArrowRight className="h-4 w-4 mr-2" />
              Process Inbox
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            Process items any time — no review needed
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (newItem.trim() && !adding) {
                handleAdd(e as unknown as React.FormEvent);
              }
            }
          }}
          placeholder="Capture something..."
          maxLength={500}
          className="flex-1"
          disabled={adding}
          enterKeyHint="send"
        />
        <Button type="submit" size="icon" disabled={adding || !newItem.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </form>

      <Separator />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">Inbox is clear</p>
            <p className="text-sm text-muted-foreground">
              Capture items with{" "}
              <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">
                Cmd+I
              </kbd>{" "}
              any time something crosses your mind
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <InboxItemCard
              key={item.id}
              item={item}
              onSave={handleSave}
              onDelete={handleDelete}
              deleting={deletingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
