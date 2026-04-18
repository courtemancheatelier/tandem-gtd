"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  CheckCircle,
  Star,
  FolderCheck,
  Target,
  X,
  ChevronRight,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface CascadeSummaryData {
  tasksPromoted: number;
  projectsCompleted: number;
  goalsUpdated: number;
}

interface CascadeToastProps {
  /** The completed task ID (for linking to full trace) */
  taskId: string;
  /** The completed task title */
  taskTitle: string;
  /** Cascade summary counts */
  summary: CascadeSummaryData;
  /** Auto-dismiss after this many milliseconds (default 5000) */
  duration?: number;
  /** Called when the toast is dismissed */
  onDismiss?: () => void;
  /** Called when user clicks to see full trace */
  onViewTrace?: () => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CascadeToast({
  taskId,
  taskTitle,
  summary,
  duration = 5000,
  onDismiss,
  onViewTrace,
  className,
}: CascadeToastProps) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const totalEffects =
    summary.tasksPromoted + summary.projectsCompleted + summary.goalsUpdated;

  const dismiss = useCallback(() => {
    setExiting(true);
    // Wait for exit animation
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 200);
  }, [onDismiss]);

  // Auto-dismiss timer
  useEffect(() => {
    if (duration > 0) {
      timerRef.current = setTimeout(dismiss, duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, dismiss]);

  // Pause timer on hover
  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    if (duration > 0) {
      timerRef.current = setTimeout(dismiss, duration);
    }
  };

  const handleViewTrace = () => {
    if (onViewTrace) {
      onViewTrace();
    } else {
      router.push(`/tasks/${taskId}`);
    }
    dismiss();
  };

  if (!visible) return null;

  // If no cascade effects, show simple completion toast
  if (totalEffects === 0) {
    return (
      <div
        className={cn(
          "pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-lg border bg-background p-4 shadow-lg transition-all",
          exiting
            ? "animate-out fade-out-80 slide-out-to-right-full"
            : "animate-in slide-in-from-bottom-full",
          className
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Task completed</p>
          <p className="text-xs text-muted-foreground truncate">{taskTitle}</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-full max-w-sm flex-col overflow-hidden rounded-lg border bg-background shadow-lg transition-all",
        exiting
          ? "animate-out fade-out-80 slide-out-to-right-full"
          : "animate-in slide-in-from-bottom-full",
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Task completed</p>
          <p className="text-xs text-muted-foreground truncate">{taskTitle}</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Cascade summary */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Cascade effects
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {summary.tasksPromoted > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] px-2 py-0.5 border-green-500/50 text-green-600 dark:text-green-400 gap-1"
            >
              <Star className="h-3 w-3" />
              {summary.tasksPromoted} promoted
            </Badge>
          )}
          {summary.projectsCompleted > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] px-2 py-0.5 border-blue-500/50 text-blue-600 dark:text-blue-400 gap-1"
            >
              <FolderCheck className="h-3 w-3" />
              {summary.projectsCompleted} completed
            </Badge>
          )}
          {summary.goalsUpdated > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] px-2 py-0.5 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 gap-1"
            >
              <Target className="h-3 w-3" />
              {summary.goalsUpdated} updated
            </Badge>
          )}
        </div>
      </div>

      {/* View trace link */}
      <div className="border-t px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs h-7"
          onClick={handleViewTrace}
        >
          View cascade trace
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Helper hook: show cascade toast after task completion
// ============================================================================

interface UseCascadeToastOptions {
  /** Override auto-dismiss duration (ms) */
  duration?: number;
}

interface CascadeToastState {
  isOpen: boolean;
  taskId: string;
  taskTitle: string;
  summary: CascadeSummaryData;
}

export function useCascadeToast(options?: UseCascadeToastOptions) {
  const [state, setState] = useState<CascadeToastState | null>(null);

  const showCascadeToast = useCallback(
    (taskId: string, taskTitle: string, summary: CascadeSummaryData) => {
      setState({ isOpen: true, taskId, taskTitle, summary });
    },
    []
  );

  const dismissCascadeToast = useCallback(() => {
    setState(null);
  }, []);

  return {
    cascadeToast: state,
    showCascadeToast,
    dismissCascadeToast,
    duration: options?.duration ?? 5000,
  };
}
