"use client";

import { useState, useMemo } from "react";
import { FlowTaskCard } from "./FlowTaskCard";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowTask } from "@/lib/flow/types";

interface FlowZoneActionableProps {
  tasks: FlowTask[];
  onComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: string) => void;
  highlightTaskId?: string | null;
}

export function FlowZoneActionable({
  tasks,
  onComplete,
  onStatusChange,
  highlightTaskId,
}: FlowZoneActionableProps) {
  const hasHighlight = !!highlightTaskId && tasks.some((t) => t.id === highlightTaskId);
  const [expanded, setExpanded] = useState(true);

  // Group by context
  const grouped = useMemo(() => {
    const groups = new Map<string, FlowTask[]>();
    for (const task of tasks) {
      const key = task.contextName || "No context";
      let arr = groups.get(key);
      if (!arr) {
        arr = [];
        groups.set(key, arr);
      }
      arr.push(task);
    }
    // Sort groups: "No context" last
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "No context") return 1;
      if (b === "No context") return -1;
      return a.localeCompare(b);
    });
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No actionable tasks — everything is either blocked or completed.
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
        <div className="h-3 w-3 rounded-full bg-green-500" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Do Now ({tasks.length})
        </h3>
        {!expanded && hasHighlight && (
          <span className="text-xs text-primary font-medium">contains highlighted task</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-4">
          {grouped.map(([context, groupTasks]) => (
            <div key={context}>
              {grouped.length > 1 && (
                <div className="text-xs font-medium text-muted-foreground px-3 py-1">
                  @{context}
                </div>
              )}
              <div className="space-y-0.5">
                {groupTasks.map((task) => (
                  <FlowTaskCard
                    key={task.id}
                    task={task}
                    onComplete={onComplete}
                    onStatusChange={onStatusChange}
                    highlight={task.id === highlightTaskId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
