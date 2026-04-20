"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/use-toast";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import Link from "next/link";

export default function DecisionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const decisionId = params.id as string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [decision, setDecision] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contributionText, setContributionText] = useState("");
  const [submittingContribution, setSubmittingContribution] = useState(false);

  const fetchDecision = useCallback(async () => {
    try {
      const res = await fetch(`/api/decisions/${decisionId}`);
      if (res.status === 404) {
        setError("Decision not found");
        return;
      }
      if (res.status === 403) {
        setError("You don't have access to this decision");
        return;
      }
      if (!res.ok) {
        setError("Failed to load decision");
        return;
      }
      setDecision(await res.json());
      setError(null);
    } catch {
      setError("Failed to load decision");
    } finally {
      setLoading(false);
    }
  }, [decisionId]);

  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);

  async function handleVote(id: string, vote: string, comment?: string) {
    const res = await fetch(`/api/decisions/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote, comment }),
    });
    if (res.ok) {
      await fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to submit vote", variant: "destructive" });
    }
  }

  async function handleResolve(id: string, resolution: string, chosenOptionId?: string) {
    const res = await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution, chosenOptionId }),
    });
    if (res.ok) {
      await fetchDecision();
      toast({ title: "Decision resolved" });
    } else {
      toast({ title: "Error", description: "Failed to resolve decision", variant: "destructive" });
    }
  }

  async function handleWithdraw(id: string) {
    const res = await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdraw: true }),
    });
    if (res.ok) {
      await fetchDecision();
      toast({ title: "Decision withdrawn" });
    } else {
      toast({ title: "Error", description: "Failed to withdraw decision", variant: "destructive" });
    }
  }

  async function handleSubmitContribution() {
    if (!contributionText.trim()) return;
    setSubmittingContribution(true);
    try {
      const res = await fetch(`/api/decisions/${decisionId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contributionText.trim() }),
      });
      if (res.ok) {
        setContributionText("");
        await fetchDecision();
      } else {
        toast({ title: "Error", description: "Failed to submit contribution", variant: "destructive" });
      }
    } finally {
      setSubmittingContribution(false);
    }
  }

  async function handleVoteOption(id: string, optionId: string) {
    const res = await fetch(`/api/decisions/${id}/vote-option`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    if (res.ok) {
      await fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to vote", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !decision) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-muted-foreground">{error || "Decision not found"}</p>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  // Determine back link — always link to the project page (no /tasks/ route exists)
  const backProjectId = decision.thread?.task?.projectId
    ?? decision.thread?.task?.project?.id
    ?? decision.thread?.projectId
    ?? null;
  const backLink = backProjectId ? `/projects/${backProjectId}` : null;

  const anchorTitle = decision.thread?.task?.title
    ?? decision.thread?.project?.title
    ?? null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        {backLink ? (
          <Link href={backLink} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {anchorTitle || "Back"}
          </Link>
        ) : (
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
      </div>

      {/* Decision card */}
      <DecisionCard
        decision={decision}
        currentUserId={session?.user?.id ?? ""}
        onVote={handleVote}
        onResolve={handleResolve}
        onWithdraw={handleWithdraw}
        onVoteOption={handleVoteOption}
      />

      {/* Respondent list */}
      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Respondents</h3>
        <div className="space-y-1">
          {decision.respondents?.map((r: { user: { id: string; name: string } }) => {
            const hasResponded = decision.decisionType === "POLL"
              ? decision.optionVotes?.some((v: { voterId: string }) => v.voterId === r.user.id)
              : decision.responses?.some((resp: { user: { id: string } }) => resp.user.id === r.user.id);
            return (
              <div key={r.user.id} className="flex items-center gap-2 text-sm">
                <span className={hasResponded ? "text-green-600" : "text-muted-foreground"}>
                  {hasResponded ? "\u2713" : "\u25CB"}
                </span>
                <span>{r.user.name}</span>
                {!hasResponded && <span className="text-xs text-muted-foreground">pending</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contributions */}
      {(decision.contributions?.length > 0 || decision.status === "OPEN") && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Contributions</h3>
          {decision.contributions?.map((c: { id: string; content: string; author: { name: string }; createdAt: string }) => (
            <div key={c.id} className="border-l-2 border-muted pl-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author.name}</span>
                <span>{new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          {decision.status === "OPEN" && (
            <div className="space-y-2 pt-2">
              <Textarea
                value={contributionText}
                onChange={(e) => setContributionText(e.target.value)}
                placeholder="Share research, analysis, or thoughts..."
                rows={3}
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleSubmitContribution}
                disabled={!contributionText.trim() || submittingContribution}
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                Add Input
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Created {new Date(decision.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
        {decision.resolvedAt && (
          <p>Resolved {new Date(decision.resolvedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
        )}
        <p className="font-mono text-[10px]">{decision.id}</p>
      </div>
    </div>
  );
}
