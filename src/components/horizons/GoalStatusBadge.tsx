"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type GoalStatus = "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "DEFERRED";

const statusConfig: Record<GoalStatus, { label: string; className: string }> = {
  NOT_STARTED: {
    label: "Not Started",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  ACHIEVED: {
    label: "Achieved",
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  DEFERRED: {
    label: "Deferred",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
};

interface GoalStatusBadgeProps {
  status: GoalStatus;
  className?: string;
}

export function GoalStatusBadge({ status, className }: GoalStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent text-xs", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
