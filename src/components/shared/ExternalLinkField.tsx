"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Link as LinkIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalLinkFieldProps {
  url: string | null;
  label: string | null;
  onSave: (url: string | null, label: string | null) => Promise<void>;
  size?: "sm" | "default";
}

function deriveLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const knownHosts: Record<string, string> = {
      "docs.google.com": "Google Drive",
      "drive.google.com": "Google Drive",
      "sheets.google.com": "Google Sheets",
      "notion.so": "Notion",
      "figma.com": "Figma",
      "github.com": "GitHub",
      "linear.app": "Linear",
    };
    return knownHosts[host] ?? host;
  } catch {
    return "External Link";
  }
}

export function ExternalLinkField({ url, label, onSave, size = "default" }: ExternalLinkFieldProps) {
  const [mode, setMode] = useState<"display" | "editing">("display");
  const [editUrl, setEditUrl] = useState(url || "");
  const [editLabel, setEditLabel] = useState(label || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayLabel = label || (url ? deriveLabel(url) : "");
  const isSmall = size === "sm";

  function startEditing() {
    setEditUrl(url || "");
    setEditLabel(label || "");
    setError(null);
    setMode("editing");
  }

  function cancel() {
    setMode("display");
    setError(null);
  }

  async function save() {
    const trimmedUrl = editUrl.trim();
    if (!trimmedUrl) {
      // Clear the link
      setSaving(true);
      await onSave(null, null);
      setSaving(false);
      setMode("display");
      return;
    }

    // Validate URL
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Please enter a valid URL (include https://)");
      return;
    }

    setSaving(true);
    await onSave(trimmedUrl, editLabel.trim() || null);
    setSaving(false);
    setMode("display");
  }

  if (mode === "editing") {
    return (
      <div className="space-y-1.5">
        <div className={cn("flex gap-2", isSmall ? "flex-col" : "flex-row")}>
          <Input
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            placeholder="Label (optional)"
            className={cn("text-sm", isSmall ? "h-7" : "h-8", !isSmall && "w-48")}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            autoFocus
          />
          <Input
            value={editUrl}
            onChange={(e) => { setEditUrl(e.target.value); setError(null); }}
            placeholder="https://..."
            className={cn("text-sm flex-1", isSmall ? "h-7" : "h-8")}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
          />
          <div className="flex gap-1 shrink-0">
            <Button size="sm" className={cn(isSmall ? "h-7" : "h-8")} onClick={save} disabled={saving}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className={cn(isSmall ? "h-7" : "h-8")} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  // Display mode
  if (!url) {
    return (
      <button
        onClick={startEditing}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <LinkIcon className="h-3.5 w-3.5" />
        Add link
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={startEditing}
        className={cn(
          "flex items-center gap-1.5 rounded border px-2 text-sm hover:bg-muted/50 transition-colors truncate",
          isSmall ? "h-7 text-xs" : "h-8"
        )}
        title={url}
      >
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{displayLabel}</span>
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
        title="Open in new tab"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </a>
      <button
        onClick={async () => {
          await onSave(null, null);
        }}
        className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
        title="Remove link"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}
