"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Inbox, Loader2 } from "lucide-react";
import { HelpLink } from "@/components/shared/HelpLink";

function CaptureForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from share target / URL params
  useEffect(() => {
    const sharedTitle = params.get("title") || "";
    const sharedText = params.get("text") || "";
    const sharedUrl = params.get("url") || "";

    // Use title if available, otherwise first 200 chars of text
    setContent(sharedTitle || sharedText.slice(0, 200) || "");

    // Combine text and URL for notes, avoiding duplication with content
    const notesParts = [
      sharedTitle ? sharedText : "", // Only put text in notes if title was used for content
      sharedUrl,
    ].filter(Boolean);
    if (notesParts.length > 0) {
      setNotes(notesParts.join("\n"));
    }
  }, [params]);

  // Auto-focus
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(async () => {
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
        toast({
          title: "Captured",
          description: content.trim().slice(0, 60) + (content.trim().length > 60 ? "..." : ""),
        });
        router.push("/do-now");
      } else {
        toast({ title: "Error", description: "Failed to capture item", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }, [content, notes, submitting, toast, router]);

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Quick Capture
          <HelpLink slug="quick-capture" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="What's on your mind?"
          maxLength={500}
          disabled={submitting}
          autoComplete="off"
        />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Notes (optional)"
          maxLength={5000}
          rows={3}
          disabled={submitting}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Enter to save &middot; Cmd+Enter from notes
          </p>
          <Button onClick={handleSubmit} disabled={!content.trim() || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Capture to Inbox"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CapturePage() {
  return (
    <div className="flex items-start justify-center pt-12 px-4">
      <Suspense>
        <CaptureForm />
      </Suspense>
    </div>
  );
}
