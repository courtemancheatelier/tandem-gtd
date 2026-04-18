"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Plus, Loader2 } from "lucide-react";
import { parseNumberedItems } from "@/lib/parsers/numbered-items";

interface InlineTaskAddProps {
  onAdd: (title: string) => Promise<void>;
  onAddMultiple?: (titles: string[]) => Promise<void>;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function InlineTaskAdd({ onAdd, onAddMultiple, disabled, autoFocus = false }: InlineTaskAddProps) {
  const [active, setActive] = useState(autoFocus);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSubmittedRef = useRef(false);

  useEffect(() => {
    if (active && inputRef.current) {
      inputRef.current.focus();
    }
  }, [active]);

  // Re-focus after submit completes and parent re-renders with new data
  useEffect(() => {
    if (justSubmittedRef.current && !submitting && inputRef.current) {
      inputRef.current.focus();
      justSubmittedRef.current = false;
    }
  });

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    justSubmittedRef.current = true;
    try {
      const parsed = onAddMultiple ? parseNumberedItems(trimmed) : null;
      if (parsed && onAddMultiple) {
        await onAddMultiple(parsed);
      } else {
        await onAdd(trimmed);
      }
      setTitle("");
    } finally {
      setSubmitting(false);
    }
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        disabled={disabled}
        className="flex items-center gap-2 w-full rounded-lg border border-dashed px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
        Add task
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/50 px-2 py-1">
      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Escape") {
            setTitle("");
            setActive(false);
          }
        }}
        onBlur={() => {
          if (!title.trim() && !submitting && !justSubmittedRef.current) {
            setActive(false);
          }
        }}
        placeholder="Add task (1.First 2.Second for multiple)"
        className="h-8 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
        disabled={submitting}
      />
      {submitting && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      )}
    </div>
  );
}
