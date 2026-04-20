"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DecisionResponseForm } from "./DecisionResponseForm";
import { OptionVoteBar } from "./OptionVoteBar";
import {
  Vote,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3,
  ExternalLink,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const VOTE_ICONS: Record<string, typeof ThumbsUp> = {
  APPROVE: ThumbsUp,
  REJECT: ThumbsDown,
  COMMENT: MessageCircle,
  DEFER: Clock,
};

const VOTE_COLORS: Record<string, string> = {
  APPROVE: "text-green-500",
  REJECT: "text-red-500",
  COMMENT: "text-blue-500",
  DEFER: "text-muted-foreground",
};

interface DecisionOption {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isChosen: boolean;
  votes: { voter: { id: string; name: string } }[];
}

interface DecisionData {
  id: string;
  question: string;
  context: string | null;
  status: string;
  decisionType?: string;
  deadline: string | null;
  resolution: string | null;
  wikiSlug: string | null;
  requester: { id: string; name: string };
  respondents: { user: { id: string; name: string } }[];
  responses: {
    vote: string;
    comment: string | null;
    user: { id: string; name: string };
  }[];
  options?: DecisionOption[];
  optionVotes?: { voterId: string; optionId: string; voter: { id: string; name: string } }[];
}

interface DecisionCardProps {
  decision: DecisionData;
  currentUserId: string;
  onVote: (decisionId: string, vote: string, comment?: string) => void;
  onResolve: (decisionId: string, resolution: string, chosenOptionId?: string) => void;
  onWithdraw?: (decisionId: string) => void;
  onVoteOption?: (decisionId: string, optionId: string) => void;
}

export function DecisionCard({
  decision,
  currentUserId,
  onVote,
  onResolve,
  onWithdraw,
  onVoteOption,
}: DecisionCardProps) {
  const [showResolve, setShowResolve] = useState(false);
  const [resolution, setResolution] = useState("");
  const [chosenOptionId, setChosenOptionId] = useState<string | undefined>();

  const isPoll = decision.decisionType === "POLL";
  const isRequester = decision.requester.id === currentUserId;
  const isRespondent = decision.respondents.some((r) => r.user.id === currentUserId);
  const existingResponse = decision.responses.find((r) => r.user.id === currentUserId);
  const isOpen = decision.status === "OPEN";
  const totalRespondents = decision.respondents.length;
  const totalResponses = isPoll
    ? (decision.optionVotes?.length ?? 0)
    : decision.responses.length;

  // For polls: current user's vote
  const currentUserOptionVote = decision.optionVotes?.find((v) => v.voterId === currentUserId);
  const totalOptionVotes = decision.optionVotes?.length ?? 0;

  const HeaderIcon = isPoll ? BarChart3 : Vote;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <HeaderIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium">{decision.question}</h4>
          {decision.context && (
            <p className="text-xs text-muted-foreground mt-1">{decision.context}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isPoll && (
            <Badge variant="outline" className="text-[10px]">Poll</Badge>
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              decision.status === "OPEN" && "border-blue-500/50 text-blue-600",
              decision.status === "RESOLVED" && "border-green-500/50 text-green-600",
              decision.status === "EXPIRED" && "border-amber-500/50 text-amber-600",
              decision.status === "WITHDRAWN" && "border-muted-foreground/50"
            )}
          >
            {decision.status}
          </Badge>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>By {decision.requester.name}</span>
        <span>{totalResponses}/{totalRespondents} voted</span>
        {decision.deadline && (
          <span>
            Due {new Date(decision.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {/* POLL: Option vote bars */}
      {isPoll && decision.options && decision.options.length > 0 && (
        <div className="space-y-1.5">
          {decision.options.map((option) => {
            const optionVoteCount = option.votes.length;
            const voters = option.votes.map((v) => v.voter);
            const isCurrentUserVote = currentUserOptionVote?.optionId === option.id;

            return (
              <OptionVoteBar
                key={option.id}
                optionId={option.id}
                label={option.label}
                description={option.description}
                voteCount={optionVoteCount}
                totalVotes={totalOptionVotes}
                voters={voters}
                isCurrentUserVote={isCurrentUserVote}
                isChosen={option.isChosen}
                disabled={!isOpen || !isRespondent}
                onClick={(optionId) => onVoteOption?.(decision.id, optionId)}
              />
            );
          })}
        </div>
      )}

      {/* APPROVAL: Responses */}
      {!isPoll && decision.responses.length > 0 && (
        <div className="space-y-1">
          {decision.responses.map((resp) => {
            const VoteIcon = VOTE_ICONS[resp.vote] ?? MessageCircle;
            const voteColor = VOTE_COLORS[resp.vote] ?? "text-muted-foreground";
            return (
              <div key={resp.user.id} className="flex items-center gap-2 text-xs">
                <VoteIcon className={cn("h-3 w-3", voteColor)} />
                <span className="font-medium">{resp.user.name}</span>
                <span className="text-muted-foreground">{resp.vote.toLowerCase()}</span>
                {resp.comment && (
                  <span className="text-muted-foreground truncate">— {resp.comment}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* APPROVAL: Vote form for respondents */}
      {!isPoll && isOpen && isRespondent && (
        <DecisionResponseForm
          onSubmit={(vote, comment) => onVote(decision.id, vote, comment)}
          existingVote={existingResponse?.vote}
          existingComment={existingResponse?.comment ?? undefined}
        />
      )}

      {/* Resolution */}
      {decision.resolution && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 mb-1">
            <CheckCircle className="h-3 w-3" />
            Resolution
          </div>
          <p className="text-sm">{decision.resolution}</p>
          {/* Show chosen option for polls */}
          {isPoll && decision.options?.some((o) => o.isChosen) && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Chosen: {decision.options.find((o) => o.isChosen)?.label}
            </p>
          )}
        </div>
      )}

      {/* Expired notice */}
      {decision.status === "EXPIRED" && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Decision expired — deadline passed without resolution
          </div>
        </div>
      )}

      {/* Wiki link + permalink */}
      {(decision.wikiSlug || decision.status !== "OPEN") && (
        <div className="flex items-center gap-3 text-xs">
          {decision.wikiSlug && decision.status === "RESOLVED" && (
            <Link href={`/wiki/${decision.wikiSlug}`} className="flex items-center gap-1 text-primary hover:underline">
              <BookOpen className="h-3 w-3" />
              Recorded in wiki
            </Link>
          )}
          <Link href={`/decisions/${decision.id}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" />
            Permalink
          </Link>
        </div>
      )}

      {/* Resolve / Withdraw for requester */}
      {isOpen && isRequester && (
        <div className="flex gap-2 pt-1">
          {showResolve ? (
            <div className="flex-1 space-y-2">
              {/* For polls, let requester pick the chosen option */}
              {isPoll && decision.options && decision.options.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Chosen option (optional)
                  </label>
                  <select
                    value={chosenOptionId ?? ""}
                    onChange={(e) => setChosenOptionId(e.target.value || undefined)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">None</option>
                    {decision.options.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <Textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Decision resolution..."
                rows={2}
                className="text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { onResolve(decision.id, resolution, chosenOptionId); setShowResolve(false); }} disabled={!resolution.trim()}>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowResolve(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setShowResolve(true)}>
                <CheckCircle className="h-3 w-3 mr-1" />
                Resolve
              </Button>
              {onWithdraw && (
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onWithdraw(decision.id)}>
                  <XCircle className="h-3 w-3 mr-1" />
                  Withdraw
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
