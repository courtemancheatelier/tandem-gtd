"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface OptionVoteBarProps {
  optionId: string;
  label: string;
  description?: string | null;
  voteCount: number;
  totalVotes: number;
  voters: { id: string; name: string }[];
  isCurrentUserVote: boolean;
  isChosen: boolean;
  disabled?: boolean;
  onClick: (optionId: string) => void;
}

export function OptionVoteBar({
  optionId,
  label,
  description,
  voteCount,
  totalVotes,
  voters,
  isCurrentUserVote,
  isChosen,
  disabled,
  onClick,
}: OptionVoteBarProps) {
  const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

  return (
    <button
      onClick={() => onClick(optionId)}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-md border p-2.5 transition-colors relative overflow-hidden",
        isCurrentUserVote
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
        isChosen && "border-green-500 bg-green-50 dark:bg-green-950/20",
        disabled && "opacity-60 cursor-default"
      )}
    >
      {/* Background bar */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 transition-all",
          isCurrentUserVote ? "bg-primary/10" : "bg-muted/50",
          isChosen && "bg-green-100 dark:bg-green-900/30"
        )}
        style={{ width: `${percentage}%` }}
      />

      {/* Content */}
      <div className="relative flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isCurrentUserVote && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
            {isChosen && (
              <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{label}</span>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
          {voters.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {voters.map((v) => v.name).join(", ")}
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {voteCount} ({percentage}%)
        </div>
      </div>
    </button>
  );
}
