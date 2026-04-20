"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FlowApiResponse } from "@/lib/flow/types";

interface FlowSummaryHeaderProps {
  summary: FlowApiResponse["summary"];
}

function formatHours(mins: number): string {
  if (mins === 0) return "0h";
  const hours = mins / 60;
  if (hours >= 24) {
    const days = Math.round(hours / 8); // 8h work days
    return `${days}d`;
  }
  return `${Math.round(hours)}h`;
}

export function FlowSummaryHeader({ summary }: FlowSummaryHeaderProps) {
  const stats = [
    {
      label: "Actionable",
      value: summary.actionableTasks,
      color: "text-green-600 dark:text-green-400",
    },
    {
      label: "Blocked",
      value: summary.blockedTasks,
      color: summary.blockedTasks > 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground",
    },
    {
      label: "Completed",
      value: summary.completedTasks,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Total",
      value: summary.totalTasks,
      color: "text-foreground",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-1.5 text-sm"
          >
            <span className={cn("text-lg font-bold tabular-nums", stat.color)}>
              {stat.value}
            </span>
            <span className="text-muted-foreground">{stat.label}</span>
          </div>
        ))}

        <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

        {/* Effort summary */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Effort:</span>
          <span className="font-medium">
            {formatHours(summary.completedEstimatedMins)}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">
            {formatHours(summary.totalEstimatedMins)}
          </span>
        </div>

        {summary.projectedCompletionDate && (
          <>
            <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
            <Badge variant="secondary" className="text-xs">
              ~{summary.projectedDaysRemaining}d remaining
            </Badge>
          </>
        )}

        {summary.longestBlockingChainDepth > 0 && (
          <>
            <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
            <span className="text-xs text-muted-foreground">
              Max chain depth: {summary.longestBlockingChainDepth}
            </span>
          </>
        )}
      </div>

      {/* Progress bar */}
      {summary.totalTasks > 0 && (
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{
              width: `${(summary.completedTasks / summary.totalTasks) * 100}%`,
            }}
          />
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{
              width: `${(summary.actionableTasks / summary.totalTasks) * 100}%`,
            }}
          />
          <div
            className="h-full bg-red-400 transition-all duration-500"
            style={{
              width: `${(summary.blockedTasks / summary.totalTasks) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
