"use client";

import { Badge } from "@/components/ui/badge";
import { Vote, Clock, BarChart3, ExternalLink } from "lucide-react";
import Link from "next/link";

interface PendingDecisionItemProps {
  decision: {
    id: string;
    question: string;
    decisionType?: string;
    deadline: string | null;
    requester: { name: string };
    thread: {
      task?: { title: string; project?: { team?: { name: string } | null } | null } | null;
      project?: { title: string; team?: { name: string } | null } | null;
    };
    respondents: { user: { id: string } }[];
    responses: { user: { id: string } }[];
    optionVotes?: { voterId: string }[];
  };
  onClick?: () => void;
}

export function PendingDecisionItem({ decision, onClick }: PendingDecisionItemProps) {
  const teamName = decision.thread.task?.project?.team?.name
    ?? decision.thread.project?.team?.name
    ?? "Team";
  const anchorTitle = decision.thread.task?.title ?? decision.thread.project?.title ?? "";
  const isOverdue = decision.deadline && new Date(decision.deadline) < new Date();
  const isPoll = decision.decisionType === "POLL";

  const totalResponses = isPoll
    ? (decision.optionVotes?.length ?? 0)
    : decision.responses.length;

  const Icon = isPoll ? BarChart3 : Vote;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
    >
      <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{decision.question}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {isPoll && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">Poll</Badge>
          )}
          <span className="text-xs text-muted-foreground">{teamName}</span>
          {anchorTitle && (
            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
              {anchorTitle}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            by {decision.requester.name}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {decision.deadline && (
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${isOverdue ? "border-destructive text-destructive" : ""}`}
          >
            <Clock className="h-2.5 w-2.5 mr-0.5" />
            {new Date(decision.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {totalResponses}/{decision.respondents.length}
        </Badge>
        <Link
          href={`/decisions/${decision.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground"
          title="View details"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </button>
  );
}
