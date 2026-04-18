"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { TimeAuditSummary } from "@/lib/time-audit/summary";

interface Challenge {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  summary: TimeAuditSummary | null;
  createdAt: string;
  _count: { entries: number };
}

interface ChallengeHistoryProps {
  onViewSummary: (summary: TimeAuditSummary) => void;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETED: "default",
  ABANDONED: "destructive",
  ACTIVE: "secondary",
  PAUSED: "outline",
};

export function ChallengeHistory({ onViewSummary }: ChallengeHistoryProps) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/time-audit")
      .then((r) => r.json())
      .then((data) => {
        setChallenges(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    await fetch(`/api/time-audit/${id}`, { method: "DELETE" });
    setChallenges((prev) => prev.filter((c) => c.id !== id));
  }

  const pastChallenges = challenges.filter(
    (c) => c.status === "COMPLETED" || c.status === "ABANDONED"
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (pastChallenges.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No past challenges yet. Start your first time audit to see where
            your time actually goes!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Past Challenges</h2>
      {pastChallenges.map((challenge) => {
        const start = new Date(challenge.startTime);
        const end = new Date(challenge.endTime);
        const durationHrs = Math.round(
          (end.getTime() - start.getTime()) / 3_600_000
        );
        const completionPct = challenge.summary
          ? (challenge.summary as TimeAuditSummary).completionPercent
          : null;

        return (
          <Card key={challenge.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {start.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <Badge variant={STATUS_VARIANT[challenge.status] ?? "secondary"}>
                    {challenge.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {durationHrs}h &middot; {challenge._count.entries} entries
                  {completionPct !== null && ` \u00B7 ${completionPct}% complete`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {challenge.summary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onViewSummary(challenge.summary as TimeAuditSummary)
                    }
                  >
                    View Summary
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(challenge.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
