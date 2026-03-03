"use client";

import { useState } from "react";
import { FlowTaskCard } from "./FlowTaskCard";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowTask } from "@/lib/flow/types";

interface FlowZoneCompletedProps {
  tasks: FlowTask[];
  highlightTaskId?: string | null;
}

export function FlowZoneCompleted({ tasks, highlightTaskId }: FlowZoneCompletedProps) {
  const hasHighlight = !!highlightTaskId && tasks.some((t) => t.id === highlightTaskId);
  const [expanded, setExpanded] = useState(hasHighlight);

  if (tasks.length === 0) return null;

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
        <div className="h-3 w-3 rounded-full bg-blue-500" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Completed ({tasks.length})
        </h3>
        {!expanded && hasHighlight && (
          <span className="text-xs text-primary font-medium">contains highlighted task</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-0.5 opacity-60">
          {tasks.map((task) => (
            <FlowTaskCard
              key={task.id}
              task={task}
              onComplete={() => {}}
              highlight={task.id === highlightTaskId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
