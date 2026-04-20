"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  FolderCheck,
  Target,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import { CascadeTracer } from "./CascadeTracer";

// ============================================================================
// Types
// ============================================================================

interface CascadeSummaryProps {
  /** The task ID that triggered the cascade */
  taskId: string;
  /** If summary data is already known, pass it to skip a fetch */
  summary?: {
    tasksPromoted: number;
    projectsCompleted: number;
    goalsUpdated: number;
  };
  className?: string;
}

interface CascadeSummaryData {
  tasksPromoted: number;
  projectsCompleted: number;
  goalsUpdated: number;
}

// ============================================================================
// Component
// ============================================================================

export function CascadeSummary({
  taskId,
  summary: initialSummary,
  className,
}: CascadeSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<CascadeSummaryData | null>(
    initialSummary ?? null
  );
  const [loading, setLoading] = useState(!initialSummary);

  // Fetch summary from cascade-trace endpoint if not provided
  useEffect(() => {
    if (initialSummary) return;

    let cancelled = false;

    async function fetchSummary() {
      try {
        const res = await fetch(`/api/tasks/${taskId}/cascade-trace`);
        if (!res.ok) {
          setSummary(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setSummary(data.summary ?? null);
        }
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [taskId, initialSummary]);

  // Don't render anything if there are no cascade effects
  if (loading) return null;
  if (
    !summary ||
    (summary.tasksPromoted === 0 &&
      summary.projectsCompleted === 0 &&
      summary.goalsUpdated === 0)
  ) {
    return null;
  }

  const totalEffects =
    summary.tasksPromoted + summary.projectsCompleted + summary.goalsUpdated;

  return (
    <div className={cn("mt-1", className)}>
      {/* Compact inline summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1 -ml-2",
          "hover:bg-accent transition-colors",
          "text-xs text-muted-foreground"
        )}
      >
        <Zap className="h-3 w-3 text-yellow-500" />
        <span className="font-medium">
          Cascade: {totalEffects} effect{totalEffects !== 1 ? "s" : ""}
        </span>

        {/* Inline badges */}
        <div className="flex items-center gap-1.5">
          {summary.tasksPromoted > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-normal border-green-500/50 text-green-600 dark:text-green-400 gap-0.5"
            >
              <Star className="h-2.5 w-2.5" />
              {summary.tasksPromoted}
            </Badge>
          )}
          {summary.projectsCompleted > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-normal border-blue-500/50 text-blue-600 dark:text-blue-400 gap-0.5"
            >
              <FolderCheck className="h-2.5 w-2.5" />
              {summary.projectsCompleted}
            </Badge>
          )}
          {summary.goalsUpdated > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-normal border-yellow-500/50 text-yellow-600 dark:text-yellow-400 gap-0.5"
            >
              <Target className="h-2.5 w-2.5" />
              {summary.goalsUpdated}
            </Badge>
          )}
        </div>

        {/* Expand toggle */}
        {expanded ? (
          <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Expanded: full cascade tree */}
      {expanded && (
        <div className="mt-2 ml-2 border-l-2 border-yellow-500/30 pl-3">
          <CascadeTracer taskId={taskId} compact />
        </div>
      )}
    </div>
  );
}
