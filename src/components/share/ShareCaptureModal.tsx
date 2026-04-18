"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Inbox, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface ShareCaptureProps {
  initialTitle: string;
  initialUrl?: string;
  isLoading?: boolean;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ShareCaptureModal({
  initialTitle,
  initialUrl,
  isLoading,
}: ShareCaptureProps) {
  const [title, setTitle] = useState(initialTitle);
  const [submitting, setSubmitting] = useState(false);

  // Sync title when metadata fetch resolves
  useEffect(() => {
    if (initialTitle) setTitle(initialTitle);
  }, [initialTitle]);
  const { toast } = useToast();
  const router = useRouter();

  const domain = initialUrl ? getDomain(initialUrl) : null;

  async function handleSave() {
    if (!title.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: title.trim(),
          source: "share",
          sourceLabel: "Share",
          ...(initialUrl && {
            externalLinkUrl: initialUrl,
            externalLinkLabel: domain,
          }),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      toast({
        title: "Added to inbox",
        description: title.trim(),
      });

      router.push("/inbox");
    } catch {
      toast({
        title: "Error",
        description: "Could not save to inbox. Try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-12">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-muted-foreground">
          <Inbox className="h-5 w-5" />
          <span className="text-sm font-medium">Share to Inbox</span>
        </div>

        {/* Task name */}
        <div className="mb-4">
          <label htmlFor="share-title" className="mb-1.5 block text-sm font-medium">
            Task name
          </label>
          {isLoading ? (
            <div className="flex h-10 items-center gap-2 rounded-md border bg-muted px-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Fetching page title...</span>
            </div>
          ) : (
            <Input
              id="share-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this?"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) handleSave();
              }}
            />
          )}
        </div>

        {/* URL display */}
        {initialUrl && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium">Source</label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">{initialUrl}</span>
            </div>
            {domain && (
              <Badge variant="secondary" className="mt-1.5">
                {domain}
              </Badge>
            )}
          </div>
        )}

        {/* Save button */}
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={submitting || isLoading || !title.trim()}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Add to Inbox"
          )}
        </Button>
      </div>
    </div>
  );
}
