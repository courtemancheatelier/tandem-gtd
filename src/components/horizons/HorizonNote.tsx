"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface HorizonNoteData {
  id: string;
  level: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface HorizonNoteProps {
  level: string;
  note: HorizonNoteData | null;
  onSaved: () => void;
}

export function HorizonNote({ level, note, onSaved }: HorizonNoteProps) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setContent(note?.content || "");
  }, [note]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/horizon-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          title: "",
          content: content.trim(),
        }),
      });
      if (res.ok) {
        setEditing(false);
        onSaved();
      } else {
        const err = await res.json();
        toast({
          title: "Error",
          description: err.error || "Failed to save note",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [level, content, onSaved, toast]);

  function cancel() {
    setContent(note?.content || "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your reflections, values, or notes for this horizon..."
          rows={4}
          maxLength={10000}
          autoFocus
        />
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            disabled={saving}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Check className="h-4 w-4 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  if (note?.content) {
    return (
      <div className="group relative">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {note.content}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left text-sm text-muted-foreground/60 hover:text-muted-foreground py-1 transition-colors"
    >
      Click to add notes...
    </button>
  );
}
