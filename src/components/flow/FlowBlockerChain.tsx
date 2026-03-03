"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import type { BlockerChainNode } from "@/lib/flow/types";

interface FlowBlockerChainProps {
  chain: BlockerChainNode[];
  depth?: number;
}

function staleColor(days: number): string {
  if (days >= 7) return "border-red-500 bg-red-500/5";
  if (days >= 3) return "border-yellow-500 bg-yellow-500/5";
  return "border-green-500 bg-green-500/5";
}

function staleBadgeColor(days: number): string {
  if (days >= 7) return "text-red-600 dark:text-red-400";
  if (days >= 3) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "WAITING":
      return "Waiting";
    default:
      return status;
  }
}

export function FlowBlockerChain({
  chain,
  depth = 0,
}: FlowBlockerChainProps) {
  if (chain.length === 0) return null;

  return (
    <div className={cn("space-y-1", depth > 0 && "ml-4")}>
      {chain.map((node) => (
        <div key={node.id}>
          <div
            className={cn(
              "border-l-2 rounded-r-sm px-2.5 py-1.5 text-sm",
              staleColor(node.staleDays)
            )}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{node.title}</span>
              {node.assignedToName && (
                <span className="text-xs text-muted-foreground">
                  @{node.assignedToName}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {statusLabel(node.status)}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  staleBadgeColor(node.staleDays)
                )}
              >
                {node.staleDays}d stale
              </span>
              {node.projectId && (
                <Link
                  href={`/projects/${node.projectId}`}
                  className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  Go to task
                </Link>
              )}
            </div>
          </div>
          {node.blockedBy.length > 0 && (
            <FlowBlockerChain chain={node.blockedBy} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}
