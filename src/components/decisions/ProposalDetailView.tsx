"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Clock,
  CheckCircle,
  Send,
  Vote,
  User,
  MessageSquare,
  PauseCircle,
  XCircle,
  Eye,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OptionVoteBar } from "./OptionVoteBar";
import { ResolutionForm } from "./ResolutionForm";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  DRAFT: { label: "Draft", color: "border-gray-400/50 text-gray-500", icon: FileText },
  GATHERING_INPUT: { label: "Gathering Input", color: "border-blue-500/50 text-blue-600", icon: MessageSquare },
  UNDER_REVIEW: { label: "Under Review", color: "border-amber-500/50 text-amber-600", icon: Eye },
  DECIDED: { label: "Decided", color: "border-green-500/50 text-green-600", icon: CheckCircle },
  DEFERRED: { label: "Deferred", color: "border-purple-500/50 text-purple-600", icon: PauseCircle },
  CANCELED: { label: "Canceled", color: "border-muted-foreground/50", icon: XCircle },
  OPEN: { label: "Open", color: "border-blue-500/50 text-blue-600", icon: Vote },
  RESOLVED: { label: "Resolved", color: "border-green-500/50 text-green-600", icon: CheckCircle },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecisionData = any;

interface ProposalDetailViewProps {
  decisionId: string;
  currentUserId: string;
  onBack: () => void;
}

export function ProposalDetailView({ decisionId, currentUserId, onBack }: ProposalDetailViewProps) {
  const [decision, setDecision] = useState<DecisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [contribution, setContribution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const { toast } = useToast();

  const fetchDecision = useCallback(async () => {
    const res = await fetch(`/api/decisions/${decisionId}`);
    if (res.ok) {
      setDecision(await res.json());
    }
    setLoading(false);
  }, [decisionId]);

  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);

  const handlePublish = async () => {
    const res = await fetch(`/api/decisions/${decisionId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast({ title: "Proposal published" });
      fetchDecision();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error || "Failed to publish", variant: "destructive" });
    }
  };

  const handleMoveToReview = async () => {
    const res = await fetch(`/api/decisions/${decisionId}/review`, { method: "POST" });
    if (res.ok) {
      toast({ title: "Moved to review" });
      fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to move to review", variant: "destructive" });
    }
  };

  const handleResolve = async (outcome: string, rationale?: string, chosenOptionId?: string) => {
    const res = await fetch(`/api/decisions/${decisionId}/resolve-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, rationale, chosenOptionId }),
    });
    if (res.ok) {
      toast({ title: "Decision made" });
      setShowResolve(false);
      fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to resolve", variant: "destructive" });
    }
  };

  const handleDefer = async () => {
    const res = await fetch(`/api/decisions/${decisionId}/defer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast({ title: "Decision deferred" });
      fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to defer", variant: "destructive" });
    }
  };

  const handleCancel = async () => {
    const res = await fetch(`/api/decisions/${decisionId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast({ title: "Decision canceled" });
      fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to cancel", variant: "destructive" });
    }
  };

  const handleVoteOption = async (optionId: string) => {
    const res = await fetch(`/api/decisions/${decisionId}/vote-option`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    if (res.ok) {
      fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to vote", variant: "destructive" });
    }
  };

  const handleSubmitContribution = async () => {
    if (!contribution.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/decisions/${decisionId}/contributions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: contribution }),
    });
    if (res.ok) {
      setContribution("");
      fetchDecision();
    } else {
      toast({ title: "Error", description: "Failed to submit", variant: "destructive" });
    }
    setSubmitting(false);
  };

  // Legacy decision handlers
  const handleLegacyVote = async (vote: string, comment?: string) => {
    const res = await fetch(`/api/decisions/${decisionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote, comment }),
    });
    if (res.ok) fetchDecision();
    else toast({ title: "Error", description: "Failed to vote", variant: "destructive" });
  };

  const handleLegacyResolve = async (resolution: string, chosenOptionId?: string) => {
    const res = await fetch(`/api/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution, chosenOptionId }),
    });
    if (res.ok) { toast({ title: "Resolved" }); fetchDecision(); }
    else toast({ title: "Error", description: "Failed to resolve", variant: "destructive" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!decision) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-muted-foreground text-sm">Decision not found.</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isOwner = decision.requester?.id === currentUserId;
  const isProposal = decision.decisionType === "PROPOSAL";
  const isPoll = decision.decisionType === "POLL" || decision.decisionType === "QUICK_POLL";
  const statusConfig = STATUS_CONFIG[decision.status] ?? { label: decision.status, color: "", icon: FileText };
  const StatusIcon = statusConfig.icon;

  const inputRequests = decision.inputRequests ?? [];
  const pendingInputs = inputRequests.filter((ir: DecisionData) => ir.status === "PENDING").length;
  const totalInputs = inputRequests.length;
  const contributions = decision.contributions ?? [];
  const events = decision.events ?? [];
  const options = decision.options ?? [];

  const canPublish = isOwner && decision.status === "DRAFT";
  const canMoveToReview = isOwner && decision.status === "GATHERING_INPUT";
  const canResolve = isOwner && (decision.status === "GATHERING_INPUT" || decision.status === "UNDER_REVIEW");
  const canDefer = isOwner && ["DRAFT", "GATHERING_INPUT", "UNDER_REVIEW"].includes(decision.status);
  const canCancel = isOwner && decision.status !== "DECIDED" && decision.status !== "CANCELED";
  const canContribute = decision.status === "GATHERING_INPUT" || decision.status === "OPEN";
  const canVoteOptions = isPoll && (decision.status === "OPEN" || decision.status === "GATHERING_INPUT");

  const currentUserOptionVote = decision.optionVotes?.find((v: DecisionData) => v.voterId === currentUserId);
  const totalOptionVotes = decision.optionVotes?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{decision.question}</h2>
            <Badge variant="outline" className={cn("text-xs", statusConfig.color)}>
              {statusConfig.label}
            </Badge>
            {isProposal && <Badge variant="outline" className="text-[10px]">Proposal</Badge>}
            {isPoll && <Badge variant="outline" className="text-[10px]">Poll</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>By {decision.requester?.name}</span>
            {decision.deadline && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                Due {new Date(decision.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
            {decision.wikiArticle && (
              <span className="flex items-center gap-0.5">
                <BookOpen className="h-3 w-3" />
                {decision.wikiArticle.title}
                {decision.wikiSection && ` > ${decision.wikiSection}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Context / Description */}
      {(decision.description || decision.context) && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Context</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-sm whitespace-pre-wrap">{decision.description || decision.context}</p>
          </CardContent>
        </Card>
      )}

      {/* Outcome (for decided proposals) */}
      {(decision.status === "DECIDED" || decision.status === "RESOLVED") && (decision.outcome || decision.resolution) && (
        <Card className="border-green-500/30">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Decision
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            <p className="text-sm font-medium">{decision.outcome || decision.resolution}</p>
            {decision.rationale && (
              <div>
                <p className="text-xs text-muted-foreground font-medium">Rationale</p>
                <p className="text-sm mt-0.5">{decision.rationale}</p>
              </div>
            )}
            {decision.decidedAt && (
              <p className="text-xs text-muted-foreground">
                Decided {new Date(decision.decidedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Options with voting */}
      {options.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Options</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {options.map((option: DecisionData) => (
              <div key={option.id} className={cn("rounded-md border p-2", option.isChosen && "border-green-500/50 bg-green-50/30 dark:bg-green-950/20")}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium flex-1">{option.label}</span>
                  {option.isChosen && <Badge className="text-[10px] bg-green-600">Chosen</Badge>}
                  {canVoteOptions && (
                    <Button
                      size="sm"
                      variant={currentUserOptionVote?.optionId === option.id ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => handleVoteOption(option.id)}
                    >
                      {currentUserOptionVote?.optionId === option.id ? "Voted" : "Vote"}
                    </Button>
                  )}
                </div>
                {option.description && <p className="text-xs text-muted-foreground mt-1">{option.description}</p>}
                <OptionVoteBar
                  optionId={option.id}
                  label={option.label}
                  description={option.description}
                  voteCount={(option.votes ?? []).length}
                  totalVotes={totalOptionVotes}
                  voters={(option.votes ?? []).map((v: DecisionData) => v.voter)}
                  isCurrentUserVote={currentUserOptionVote?.optionId === option.id}
                  isChosen={option.isChosen}
                  disabled={!canVoteOptions}
                  onClick={handleVoteOption}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Input Requests Progress */}
      {totalInputs > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Input Requests ({totalInputs - pendingInputs}/{totalInputs} complete)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {inputRequests.map((ir: DecisionData) => (
                <div key={ir.id} className="flex items-center gap-2 text-sm">
                  {ir.status === "SUBMITTED" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  ) : ir.status === "EXPIRED" || ir.status === "WAIVED" ? (
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  )}
                  <span className="flex-1 truncate">
                    <span className="font-medium">{ir.assignee?.name}</span>
                    {ir.prompt && <span className="text-muted-foreground"> — {ir.prompt}</span>}
                  </span>
                  <Badge variant="outline" className="text-[9px]">{ir.type}</Badge>
                  <Badge variant="outline" className={cn("text-[9px]",
                    ir.status === "SUBMITTED" && "text-green-600",
                    ir.status === "PENDING" && "text-blue-600"
                  )}>{ir.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contributions */}
      {contributions.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Contributions ({contributions.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            {contributions.map((c: DecisionData) => (
              <div key={c.id} className="rounded-md border p-2">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium">{c.author?.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Contribution form */}
      {canContribute && (
        <Card>
          <CardContent className="py-3 px-4">
            <Textarea
              placeholder="Add your input..."
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={handleSubmitContribution} disabled={!contribution.trim() || submitting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Submit Input
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy APPROVAL voting */}
      {decision.decisionType === "APPROVAL" && decision.status === "OPEN" && decision.respondents?.some((r: DecisionData) => r.user?.id === currentUserId) && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Your Vote</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex gap-2">
              {["APPROVE", "REJECT", "COMMENT", "DEFER"].map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={decision.responses?.find((r: DecisionData) => r.user?.id === currentUserId)?.vote === v ? "default" : "outline"}
                  onClick={() => handleLegacyVote(v)}
                  className="text-xs"
                >
                  {v}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolution form */}
      {showResolve && isProposal && (
        <ResolutionForm
          options={options}
          onResolve={handleResolve}
          onCancel={() => setShowResolve(false)}
        />
      )}

      {/* Action buttons */}
      {isOwner && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap gap-2">
              {canPublish && (
                <Button size="sm" onClick={handlePublish}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Publish
                </Button>
              )}
              {canMoveToReview && (
                <Button size="sm" variant="outline" onClick={handleMoveToReview}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Move to Review
                </Button>
              )}
              {canResolve && isProposal && (
                <Button size="sm" onClick={() => setShowResolve(!showResolve)}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Decide
                </Button>
              )}
              {canResolve && !isProposal && decision.status === "OPEN" && (
                <Button size="sm" onClick={() => {
                  const res = prompt("Enter resolution:");
                  if (res) handleLegacyResolve(res);
                }}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Resolve
                </Button>
              )}
              {canDefer && (
                <Button size="sm" variant="outline" onClick={handleDefer}>
                  <PauseCircle className="h-3.5 w-3.5 mr-1" /> Defer
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={handleCancel}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Trail */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Activity ({events.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {events.map((event: DecisionData) => (
                <div key={event.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0 w-16">
                    {new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="font-medium shrink-0">{event.actor?.name}</span>
                  <span className="text-muted-foreground">{event.message || event.type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
