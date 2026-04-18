"use client";

import { useState } from "react";
import { FlowTaskCard } from "./FlowTaskCard";
import { FlowBlockerChain } from "./FlowBlockerChain";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowBlockedTask } from "@/lib/flow/types";

interface FlowZoneBlockedProps {
  tasks: FlowBlockedTask[];
  onComplete: (taskId: string, note?: string) => void;
  onStatusChange: (taskId: string, status: string) => void;
  highlightTaskId?: string | null;
}

function staleBadgeStyle(days: number) {
  if (days >= 7) return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  if (days >= 3) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
  return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
}

function BlockedTaskRow({
  task,
  onComplete,
  onStatusChange,
  highlight,
}: {
  task: FlowBlockedTask;
  onComplete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  highlight: boolean;
}) {
  const [chainOpen, setChainOpen] = useState(false);

  return (
    <div className={cn("rounded-md border", highlight && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
      {/* Compact row: task + blocker summary */}
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex-1 min-w-0">
          <FlowTaskCard
            task={task}
            onComplete={onComplete}
            onStatusChange={onStatusChange}
          />
        </div>
        <button
          onClick={() => setChainOpen(!chainOpen)}
          className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/50"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", chainOpen && "rotate-90")} />
          <span className={cn("px-1.5 py-0 rounded-full text-[10px] font-medium", staleBadgeStyle(task.stalestBlockerDays))}>
            {task.totalChainDepth} blocker{task.totalChainDepth !== 1 ? "s" : ""}
            {task.stalestBlockerDays >= 3 && ` · ${task.stalestBlockerDays}d`}
          </span>
        </button>
      </div>

      {/* Expanded blocker chain */}
      {chainOpen && (
        <div className="px-3 pb-2 pt-1 border-t mx-2 mb-1">
          <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Blocked by</div>
          <FlowBlockerChain chain={task.blockerChain} />
        </div>
      )}
    </div>
  );
}

export function FlowZoneBlocked({
  tasks,
  onComplete,
  onStatusChange,
  highlightTaskId,
}: FlowZoneBlockedProps) {
  const hasHighlight = !!highlightTaskId && tasks.some((t) => t.id === highlightTaskId);
  const [expanded, setExpanded] = useState(true);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No blocked tasks — everything is either actionable or completed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
        <div className="h-3 w-3 rounded-full bg-red-500" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Blocked ({tasks.length})
        </h3>
        {!expanded && hasHighlight && (
          <span className="text-xs text-primary font-medium">contains highlighted task</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-1">
          {tasks.map((task) => (
            <BlockedTaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onStatusChange={onStatusChange}
              highlight={task.id === highlightTaskId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
