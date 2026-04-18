"use client";

import { useEffect, useState, useCallback } from "react";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface TeamDecisionsTabProps {
  teamId: string;
  currentUserId: string;
}

export function TeamDecisionsTab({ teamId, currentUserId }: TeamDecisionsTabProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  const fetchDecisions = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/decisions`);
    if (res.ok) {
      setDecisions(await res.json());
    }
    setLoading(false);
    setLoaded(true);
  }, [teamId]);

  useEffect(() => {
    if (!loaded) {
      fetchDecisions();
    }
  }, [loaded, fetchDecisions]);

  async function handleVote(decisionId: string, vote: string, comment?: string) {
    const res = await fetch(`/api/decisions/${decisionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote, comment }),
    });
    if (res.ok) {
      await fetchDecisions();
    } else {
      toast({ title: "Error", description: "Failed to submit vote", variant: "destructive" });
    }
  }

  async function handleResolve(decisionId: string, resolution: string, chosenOptionId?: string) {
    const res = await fetch(`/api/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution, chosenOptionId }),
    });
    if (res.ok) {
      await fetchDecisions();
      toast({ title: "Decision resolved" });
    } else {
      toast({ title: "Error", description: "Failed to resolve decision", variant: "destructive" });
    }
  }

  async function handleWithdraw(decisionId: string) {
    const res = await fetch(`/api/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdraw: true }),
    });
    if (res.ok) {
      await fetchDecisions();
      toast({ title: "Decision withdrawn" });
    } else {
      toast({ title: "Error", description: "Failed to withdraw decision", variant: "destructive" });
    }
  }

  async function handleVoteOption(decisionId: string, optionId: string) {
    const res = await fetch(`/api/decisions/${decisionId}/vote-option`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    if (res.ok) {
      await fetchDecisions();
    } else {
      toast({ title: "Error", description: "Failed to vote", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openDecisions = decisions.filter((d) => d.status === "OPEN");
  const resolvedDecisions = decisions.filter((d) => d.status !== "OPEN");

  return (
    <div className="space-y-4">
      {decisions.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-muted-foreground text-sm">
              No decisions yet. Create decisions from project pages.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {openDecisions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Open ({openDecisions.length})
              </h3>
              {openDecisions.map((d) => (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  currentUserId={currentUserId}
                  onVote={handleVote}
                  onResolve={handleResolve}
                  onWithdraw={handleWithdraw}
                  onVoteOption={handleVoteOption}
                />
              ))}
            </div>
          )}
          {resolvedDecisions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Resolved ({resolvedDecisions.length})
              </h3>
              {resolvedDecisions.map((d) => (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  currentUserId={currentUserId}
                  onVote={handleVote}
                  onResolve={handleResolve}
                  onWithdraw={handleWithdraw}
                  onVoteOption={handleVoteOption}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
