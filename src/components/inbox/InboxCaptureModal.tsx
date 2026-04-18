"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Inbox, Plus, StickyNote, ListTodo, Wand2 } from "lucide-react";
import { parseNaturalLanguageTask, type ParsedTask } from "@/lib/parsers/natural-language-task";
import { parseNumberedItems } from "@/lib/parsers/numbered-items";
import { TaskPreviewCard } from "@/components/tasks/TaskPreviewCard";

interface ContextOption {
  id: string;
  name: string;
  color: string | null;
}

interface ProjectOption {
  id: string;
  title: string;
}

export function InboxCaptureModal() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [saveAsTask, setSaveAsTask] = useState(false);
  const [contexts, setContexts] = useState<ContextOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [contextId, setContextId] = useState("none");
  const [parsedTask, setParsedTask] = useState<ParsedTask | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Global Cmd+I / Ctrl+I keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch contexts and projects when modal opens
  useEffect(() => {
    if (!open) return;
    async function fetchData() {
      try {
        const [ctxRes, projRes] = await Promise.all([
          fetch("/api/contexts"),
          fetch("/api/projects?status=ACTIVE"),
        ]);
        if (ctxRes.ok) setContexts(await ctxRes.json());
        if (projRes.ok) {
          const data = await projRes.json();
          setProjects(data.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title })));
        }
      } catch {
        // Silently fail
      }
    }
    fetchData();
  }, [open]);

  // Reset state when modal closes
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSessionCount(0);
      setContent("");
      setNotes("");
      setShowNotes(false);
      setSaveAsTask(false);
      setContextId("none");
      setParsedTask(null);
    }
  }, []);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (open && !parsedTask) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, parsedTask]);

  function handleSmartParse() {
    if (!content.trim()) return;
    const parsed = parseNaturalLanguageTask(content.trim(), {
      contexts: contexts.map((c) => ({ id: c.id, name: c.name })),
      projects,
    });
    // Show preview if any structured fields were extracted
    const hasFields = Object.keys(parsed.confidence).length > 0;
    if (hasFields) {
      setParsedTask(parsed);
    } else {
      // No fields extracted — just save as inbox item
      handleSubmitInbox();
    }
  }

  async function handleSubmitBulkInbox(items: string[]) {
    if (submitting) return;
    setSubmitting(true);
    try {
      let created = 0;
      for (const item of items) {
        const res = await fetch("/api/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: item }),
        });
        if (res.ok) created++;
      }
      if (created > 0) {
        setSessionCount((prev) => prev + created);
        setContent("");
        setNotes("");
        setShowNotes(false);
        setParsedTask(null);
        toast({
          title: "Captured",
          description: `${created} item${created !== 1 ? "s" : ""} added to inbox`,
        });
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitInbox() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (res.ok) {
        setSessionCount((prev) => prev + 1);
        setContent("");
        setNotes("");
        setShowNotes(false);
        setParsedTask(null);
        toast({
          title: "Captured",
          description: content.trim().slice(0, 60) + (content.trim().length > 60 ? "..." : ""),
        });
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitTask(data?: {
    title: string;
    dueDate?: string;
    scheduledDate?: string;
    contextId?: string;
    estimatedMins?: number;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
    projectId?: string;
  }) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = data || {
        title: content.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(contextId !== "none" ? { contextId } : {}),
      };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSessionCount((prev) => prev + 1);
        setContent("");
        setNotes("");
        setShowNotes(false);
        setParsedTask(null);
        setSaveAsTask(false);
        setContextId("none");
        toast({
          title: "Task created",
          description: (data?.title || content.trim()).slice(0, 60) + ((data?.title || content.trim()).length > 60 ? "..." : ""),
        });
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCapture() {
    const trimmed = content.trim();
    if (!trimmed) return;
    if (saveAsTask) {
      handleSubmitTask();
      return;
    }
    // Check for numbered bulk syntax first (e.g. "1:Buy groceries 2:Call dentist")
    const numbered = parseNumberedItems(trimmed);
    if (numbered) {
      handleSubmitBulkInbox(numbered);
      return;
    }
    handleSmartParse();
  }

  function handleContentKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCapture();
    }
  }

  function handleNotesKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCapture();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Quick Capture
            {sessionCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {sessionCount} item{sessionCount !== 1 ? "s" : ""} captured
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {parsedTask
              ? "Review the parsed task below, then create or go back."
              : <>Type naturally — dates, @context, ~time, !energy are auto-detected. Press Enter to save.</>}
          </DialogDescription>
        </DialogHeader>

        {parsedTask ? (
          <TaskPreviewCard
            parsed={parsedTask}
            contexts={contexts}
            projects={projects}
            onConfirm={(data) => handleSubmitTask(data)}
            onCancel={() => setParsedTask(null)}
          />
        ) : (
          <div className="space-y-3">
            <Input
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleContentKeyDown}
              placeholder="What's on your mind?"
              maxLength={500}
              disabled={submitting}
              autoComplete="off"
            />

            {showNotes ? (
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={handleNotesKeyDown}
                placeholder="Additional notes... (Cmd+Enter to save)"
                maxLength={5000}
                rows={3}
                disabled={submitting}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setShowNotes(true)}
              >
                <StickyNote className="h-3.5 w-3.5 mr-1.5" />
                Add notes
              </Button>
            )}

            {saveAsTask ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary flex items-center gap-1.5">
                    <ListTodo className="h-3.5 w-3.5" />
                    Save as task (manual)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-6 px-2"
                    onClick={() => { setSaveAsTask(false); setContextId("none"); }}
                  >
                    Switch to smart capture
                  </Button>
                </div>
                <Select value={contextId} onValueChange={setContextId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="No context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No context</SelectItem>
                    {contexts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setSaveAsTask(true)}
              >
                <ListTodo className="h-3.5 w-3.5 mr-1.5" />
                Save as task (manual)
              </Button>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                {saveAsTask
                  ? (showNotes ? "Cmd+Enter to save" : "Enter to save task")
                  : (showNotes ? "Cmd+Enter to capture" : "Enter to capture")} &middot; Esc to close
              </p>
              <Button
                size="sm"
                onClick={handleCapture}
                disabled={!content.trim() || submitting}
              >
                {saveAsTask ? (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    {submitting ? "Saving..." : "Create Task"}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-1" />
                    {submitting ? "Saving..." : "Capture"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
