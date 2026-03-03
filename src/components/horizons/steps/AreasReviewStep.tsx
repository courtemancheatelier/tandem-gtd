"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Layers,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { AreaList } from "@/components/horizons/AreaList";
import type { AreaData } from "@/components/areas/AreaCard";
import type { GoalData } from "@/components/horizons/GoalList";

interface StepProps {
  mode: "setup" | "review";
  notes: string;
  onNotesChange: (val: string) => void;
  onMarkComplete: () => void;
  onBack?: () => void;
  saving: boolean;
}

export function AreasReviewStep({
  mode,
  notes,
  onNotesChange,
  onMarkComplete,
  onBack,
  saving,
}: StepProps) {
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAreas = useCallback(async () => {
    try {
      const res = await fetch("/api/areas");
      if (res.ok) {
        setAreas(await res.json());
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [, goalsRes] = await Promise.all([
          fetchAreas(),
          fetch("/api/goals?horizon=HORIZON_3"),
        ]);
        if (goalsRes.ok) {
          setGoals(await goalsRes.json());
        }
      } catch {
        // Silently fail
      }
      setLoading(false);
    }
    fetchData();
  }, [fetchAreas]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeGoals = goals.filter(
    (g) => g.status !== "ACHIEVED" && g.status !== "DEFERRED"
  );

  return (
    <div className="space-y-4">
      {/* Intro */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Layers className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium">
                20,000ft — Areas of Responsibility
              </h4>
              {mode === "setup" ? (
                <div className="text-sm text-muted-foreground mt-2 space-y-2">
                  <p>
                    Areas of responsibility are the ongoing parts of life you need to maintain.
                    They never &ldquo;complete&rdquo; — they&apos;re standards you keep.
                  </p>
                  <p>
                    Common areas: Health, Finances, Career, Home, Relationships, Personal Growth, Creativity.
                    Think about what would fall apart if you ignored it for 3 months.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Are your areas still accurate? Any to add, archive, or reprioritize?
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Goals reference */}
      {activeGoals.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              Your active goals for reference:
            </p>
            <div className="space-y-1">
              {activeGoals.map((g) => (
                <p key={g.id} className="text-sm text-muted-foreground">
                  &bull; {g.title}
                  {g.area && (
                    <span className="text-xs ml-1">({g.area.name})</span>
                  )}
                </p>
              ))}
            </div>
            {mode === "setup" && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Do your areas cover the ground your goals need?
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Areas list with inline create/edit */}
      <Card>
        <CardContent className="py-4">
          <AreaList areas={areas} onRefresh={fetchAreas} />
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
              placeholder="Any areas to add, archive, or adjust? Are all areas getting enough attention?"
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
