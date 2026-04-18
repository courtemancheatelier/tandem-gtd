"use client";

import { useEffect, useState, useCallback } from "react";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { NewDecisionDialog } from "@/components/decisions/NewDecisionDialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ProjectDecisionsTabProps {
  projectId: string;
  currentUserId: string;
  members: { id: string; name: string }[];
  tasks?: { id: string; title: string }[];
  wikiArticles?: { slug: string; title: string }[];
}

export function ProjectDecisionsTab({ projectId, currentUserId, members, tasks, wikiArticles }: ProjectDecisionsTabProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const { toast } = useToast();

  const fetchDecisions = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/decisions`);
    if (res.ok) {
      setDecisions(await res.json());
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

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

  async function handleCreateDecision(data: {
    question: string;
    context?: string;
    respondentIds: string[];
    deadline?: string;
    decisionType?: "APPROVAL" | "POLL" | "QUICK_POLL" | "PROPOSAL";
    options?: { label: string; description?: string }[];
    taskId?: string;
    wikiSlug?: string;
  }) {
    const payload = data.taskId
      ? { ...data, taskId: data.taskId }
      : { ...data, projectId };
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setNewOpen(false);
      await fetchDecisions();
      toast({ title: "Decision created" });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error || "Failed to create decision", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {decisions.length} decision{decisions.length !== 1 ? "s" : ""}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Decision
        </Button>
      </div>

      {decisions.length > 0 ? (
        <div className="space-y-3">
          {decisions.map((d) => (
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
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">
          No decisions yet. Create one to get team input.
        </p>
      )}

      <NewDecisionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmit={handleCreateDecision}
        members={members}
        currentUserId={currentUserId}
        tasks={tasks}
        wikiArticles={wikiArticles}
      />
    </div>
  );
}
