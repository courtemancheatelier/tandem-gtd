"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusCircle } from "@/components/shared/StatusCircle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { FlowTask } from "@/lib/flow/types";

interface FlowTaskCardProps {
  task: FlowTask;
  onComplete: (taskId: string, note?: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  highlight?: boolean;
}

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED": return "Not started";
    case "IN_PROGRESS": return "In progress";
    case "COMPLETED": return "Completed";
    case "WAITING": return "Waiting";
    case "DROPPED": return "Dropped";
    default: return status;
  }
}

export function FlowTaskCard({
  task,
  onComplete,
  onStatusChange,
  highlight,
}: FlowTaskCardProps) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function handleStatusClick() {
    if (task.status === "NOT_STARTED") {
      onStatusChange?.(task.id, "IN_PROGRESS");
    } else if (task.status === "IN_PROGRESS") {
      setCompleting(true);
      onComplete(task.id);
    }
  }

  return (
    <div
      data-task-id={task.id}
      className={cn(
        "rounded-md transition-all",
        completing && "opacity-50 scale-95",
        expanded && "bg-muted/30 border",
        highlight && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 rounded-md cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <StatusCircle
            status={task.status}
            onClick={handleStatusClick}
            disabled={task.status === "COMPLETED" || task.status === "DROPPED"}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{task.title}</span>
            {task.isNextAction && (
              <Zap className="h-3 w-3 text-amber-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {task.contextName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                @{task.contextName}
              </Badge>
            )}
            {task.estimatedMins && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {task.estimatedMins >= 60
                  ? `${Math.round(task.estimatedMins / 60)}h`
                  : `${task.estimatedMins}m`}
              </span>
            )}
            {task.assignedToName && (
              <span className="text-[10px] text-muted-foreground">
                {task.assignedToName}
              </span>
            )}
            {task.projectTitle && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {task.projectTitle}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t mx-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="text-muted-foreground">Status</div>
            <div>{statusLabel(task.status)}</div>

            {task.estimatedMins && (
              <>
                <div className="text-muted-foreground">Estimate</div>
                <div>
                  {task.estimatedMins >= 60
                    ? `${Math.round(task.estimatedMins / 60)}h`
                    : `${task.estimatedMins}m`}
                </div>
              </>
            )}

            {task.contextName && (
              <>
                <div className="text-muted-foreground">Context</div>
                <div>@{task.contextName}</div>
              </>
            )}

            {task.assignedToName && (
              <>
                <div className="text-muted-foreground">Assigned to</div>
                <div>{task.assignedToName}</div>
              </>
            )}

            {task.completedAt && (
              <>
                <div className="text-muted-foreground">Completed</div>
                <div>{new Date(task.completedAt).toLocaleDateString()}</div>
              </>
            )}

            <div className="text-muted-foreground">Last updated</div>
            <div>{new Date(task.updatedAt).toLocaleDateString()}</div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/projects/${task.projectId}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Go to project
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
