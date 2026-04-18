"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  CheckSquare,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Plus,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";

interface StepProps {
  mode: "setup" | "review";
  notes: string;
  onNotesChange: (val: string) => void;
  onMarkComplete: () => void;
  onBack?: () => void;
  saving: boolean;
}

export function ActionsSummaryStep({
  mode,
  notes,
  onNotesChange,
  onMarkComplete,
  onBack,
  saving,
}: StepProps) {
  const [actionCount, setActionCount] = useState(0);
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/tasks?isNextAction=true&status=NOT_STARTED,IN_PROGRESS&limit=1");
        if (res.ok) {
          const data = await res.json();
          if (data.pagination) {
            setActionCount(data.pagination.total);
          } else if (Array.isArray(data)) {
            setActionCount(data.length);
          }
        }
      } catch {
        // Silently fail
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  async function captureToInbox() {
    if (!captureText.trim()) return;
    setCapturing(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: captureText.trim() }),
      });
      if (res.ok) {
        toast({ title: "Captured to inbox" });
        setCaptureText("");
      }
    } catch {
      toast({ title: "Failed to capture", variant: "destructive" });
    }
    setCapturing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Intro */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <CheckSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium">
                Runway — Current Actions
              </h4>
              {mode === "setup" ? (
                <p className="text-sm text-muted-foreground mt-1">
                  You have <strong>{actionCount}</strong> next action{actionCount !== 1 ? "s" : ""}.
                  Anything on your mind right now? Capture it before we finish.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  You have <strong>{actionCount}</strong> next action{actionCount !== 1 ? "s" : ""}.
                  Any lingering actions that no longer serve your direction?
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Link to do-now */}
      <Card>
        <CardContent className="py-4">
          <Link href="/do-now">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Go to Do Now
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Quick capture */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            Quick Capture
          </h4>
          <p className="text-sm text-muted-foreground">
            Capture any next actions or thoughts to your inbox.
          </p>
          <div className="flex gap-2">
            <Input
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              placeholder="Type a next action or thought..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && captureText.trim()) {
                  captureToInbox();
                }
              }}
            />
            <Button
              size="sm"
              onClick={captureToInbox}
              disabled={!captureText.trim() || capturing}
            >
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Capture"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reflection notes (review mode) */}
      {mode === "review" && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <h4 className="text-sm font-medium">Reflection notes</h4>
            <Textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Any actions to clean up or new ones to capture?"
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="flex justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button onClick={onMarkComplete} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Complete
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
