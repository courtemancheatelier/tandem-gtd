"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Target,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { GoalList, type GoalData } from "@/components/horizons/GoalList";

interface StepProps {
  mode: "setup" | "review";
  notes: string;
  onNotesChange: (val: string) => void;
  onMarkComplete: () => void;
  onBack?: () => void;
  saving: boolean;
}

interface HorizonNoteData {
  id: string;
  level: string;
  content: string;
}

export function GoalsReviewStep({
  mode,
  notes,
  onNotesChange,
  onMarkComplete,
  onBack,
  saving,
}: StepProps) {
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [visionNote, setVisionNote] = useState<HorizonNoteData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch("/api/goals?horizon=HORIZON_3");
      if (res.ok) {
        setGoals(await res.json());
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [, notesRes] = await Promise.all([
          fetchGoals(),
          fetch("/api/horizon-notes"),
        ]);
        if (notesRes.ok) {
          const allNotes: HorizonNoteData[] = await notesRes.json();
          setVisionNote(allNotes.find((n) => n.level === "HORIZON_4") || null);
        }
      } catch {
        // Silently fail
      }
      setLoading(false);
    }
    fetchData();
  }, [fetchGoals]);

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
            <Target className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium">
                30,000ft — Goals
              </h4>
              {mode === "setup" ? (
                <div className="text-sm text-muted-foreground mt-2 space-y-2">
                  <p>
                    Goals are specific, measurable outcomes you want in the next 1-2 years.
                    They should connect to your vision — each one moves you closer.
                  </p>
                  <p>Look at what you wrote for your vision. What goals would make that real?</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Review your goals. Update progress, mark achieved ones, defer or drop what no longer serves you.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vision reference */}
      {visionNote?.content && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              Your vision for reference:
            </p>
            <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground whitespace-pre-wrap line-clamp-4">
              {visionNote.content}
            </blockquote>
          </CardContent>
        </Card>
      )}

      {/* Goals list with inline create/edit */}
      <Card>
        <CardContent className="py-4">
          <GoalList goals={goals} onRefresh={fetchGoals} />
        </CardContent>
      </Card>

      {/* Reflection notes */}
      {mode === "review" && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <h4 className="text-sm font-medium">Reflection notes</h4>
            <Textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="How are your goals progressing? Any new goals to consider?"
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
              Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
