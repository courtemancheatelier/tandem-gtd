"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  CheckCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { CascadeNode, type CascadeNodeData } from "./CascadeNode";

// ============================================================================
// Types
// ============================================================================

interface CascadeTrace {
  root: {
    id: string;
    type: "task";
    title: string;
    eventType: "COMPLETED";
    timestamp: string;
  };
  children: CascadeNodeData[];
  summary: {
    tasksPromoted: number;
    projectsCompleted: number;
    goalsUpdated: number;
  };
}

interface CascadeTracerProps {
  taskId: string;
  /** Optional: pass in trace data to skip fetching */
  initialTrace?: CascadeTrace | null;
  /** Compact mode hides the card wrapper */
  compact?: boolean;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CascadeTracer({
  taskId,
  initialTrace,
  compact = false,
  className,
}: CascadeTracerProps) {
  const [trace, setTrace] = useState<CascadeTrace | null>(initialTrace ?? null);
  const [loading, setLoading] = useState(!initialTrace);
  const [error, setError] = useState<string | null>(null);

  const fetchTrace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/cascade-trace`);
      if (!res.ok) {
        if (res.status === 404) {
          // Task has no cascade (not completed or no triggered events)
          setTrace(null);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch cascade trace: ${res.status}`);
      }
      const data: CascadeTrace = await res.json();
      setTrace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cascade trace");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!initialTrace) {
      fetchTrace();
    }
  }, [fetchTrace, initialTrace]);

  // ---- Loading state ----
  if (loading) {
    const loader = (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading cascade trace...</span>
      </div>
    );

    if (compact) return loader;

    return (
      <Card className={className}>
        <CardContent className="py-4">{loader}</CardContent>
      </Card>
    );
  }

  // ---- Error state ----
  if (error) {
    const errorContent = (
      <div className="flex items-center gap-2 py-4">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">{error}</span>
        <Button variant="ghost" size="sm" onClick={fetchTrace}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Retry
        </Button>
      </div>
    );

    if (compact) return errorContent;

    return (
      <Card className={className}>
        <CardContent className="py-4">{errorContent}</CardContent>
      </Card>
    );
  }

  // ---- No cascade ----
  if (!trace || trace.children.length === 0) {
    if (compact) return null; // Don't show anything in compact mode if no cascade

    return (
      <Card className={className}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span className="text-sm">No cascade effects from this task.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Summary badges ----
  const { summary } = trace;
  const hasSummary =
    summary.tasksPromoted > 0 ||
    summary.projectsCompleted > 0 ||
    summary.goalsUpdated > 0;

  const summaryBadges = hasSummary ? (
    <div className="flex items-center gap-2 flex-wrap">
      {summary.tasksPromoted > 0 && (
        <Badge variant="outline" className="border-green-500/50 text-green-600 dark:text-green-400">
          {summary.tasksPromoted} task{summary.tasksPromoted !== 1 ? "s" : ""} promoted
        </Badge>
      )}
      {summary.projectsCompleted > 0 && (
        <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400">
          {summary.projectsCompleted} project{summary.projectsCompleted !== 1 ? "s" : ""} completed
        </Badge>
      )}
      {summary.goalsUpdated > 0 && (
        <Badge variant="outline" className="border-yellow-500/50 text-yellow-600 dark:text-yellow-400">
          {summary.goalsUpdated} goal{summary.goalsUpdated !== 1 ? "s" : ""} updated
        </Badge>
      )}
    </div>
  ) : null;

  // ---- Cascade tree ----
  const treeContent = (
    <div className="space-y-3">
      {/* Root node */}
      <div className="flex items-start gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10 mt-0.5">
          <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal border-green-500/50 text-green-600 dark:text-green-400">
              Task
            </Badge>
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Completed
            </span>
          </div>
          <Link
            href={`/tasks/${trace.root.id}`}
            className="text-sm font-medium hover:underline mt-0.5 block truncate"
          >
            {trace.root.title}
          </Link>
          <span className="text-xs text-muted-foreground">
            {new Date(trace.root.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Cascade arrow */}
      <div className="flex items-center gap-2 pl-3">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">
          Cascade effects
        </span>
      </div>

      {/* Child nodes */}
      <div className="ml-4 space-y-2">
        {trace.children.map((child, index) => (
          <CascadeNode
            key={`${child.type}-${child.id}`}
            node={child}
            depth={0}
            isLast={index === trace.children.length - 1}
          />
        ))}
      </div>
    </div>
  );

  // ---- Compact mode ----
  if (compact) {
    return (
      <div className={className}>
        {summaryBadges}
        {treeContent}
      </div>
    );
  }

  // ---- Full card mode ----
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            Cascade Trace
          </CardTitle>
          {summaryBadges}
        </div>
      </CardHeader>
      <CardContent>{treeContent}</CardContent>
    </Card>
  );
}
