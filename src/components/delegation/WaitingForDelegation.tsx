"use client";

import { useState } from "react";
import { DelegationBadge } from "./DelegationBadge";

interface Delegation {
  id: string;
  status: string;
  sentAt: string;
  note?: string | null;
  task: {
    id: string;
    title: string;
  };
  delegatee: {
    id: string;
    name: string;
  };
}

interface WaitingForDelegationProps {
  delegation: Delegation;
  onRecall: (delegationId: string) => Promise<void>;
}

export function WaitingForDelegation({
  delegation,
  onRecall,
}: WaitingForDelegationProps) {
  const [recalling, setRecalling] = useState(false);
  const canRecall =
    delegation.status === "PENDING" || delegation.status === "VIEWED";

  const handleRecall = async () => {
    setRecalling(true);
    try {
      await onRecall(delegation.id);
    } finally {
      setRecalling(false);
    }
  };

  const timeAgo = getTimeAgo(delegation.sentAt);

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium">{delegation.task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">
              → {delegation.delegatee.name}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <DelegationBadge
              delegatorName=""
              status={delegation.status}
            />
          </div>
          {delegation.note && (
            <p className="text-sm text-muted-foreground mt-1 italic">
              &ldquo;{delegation.note}&rdquo;
            </p>
          )}
        </div>
        {canRecall && (
          <button
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent disabled:opacity-50"
            onClick={handleRecall}
            disabled={recalling}
          >
            {recalling ? "Recalling..." : "Recall"}
          </button>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
