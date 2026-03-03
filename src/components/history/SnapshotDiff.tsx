"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatFieldChange } from "@/lib/history/format";
import { GitCompare, Loader2, CheckCircle } from "lucide-react";

interface SnapshotDiffData {
  snapshotId: string;
  taskId: string;
  reason: string;
  createdAt: string;
  snapshotState: Record<string, unknown>;
  currentState: Record<string, unknown>;
  changes: Record<string, { old: unknown; new: unknown }>;
  hasChanges: boolean;
}

interface SnapshotDiffProps {
  taskId: string;
  snapshotId: string;
  className?: string;
}

/**
 * Field labels for nicer display of snapshot state fields.
 */
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  notes: "Description",
  status: "Status",
  energyLevel: "Energy Level",
  estimatedMins: "Time Estimate",
  contextId: "Context",
  projectId: "Project",
  scheduledDate: "Scheduled Date",
  dueDate: "Due Date",
  isNextAction: "Next Action",
  predecessorIds: "Dependencies",
  isMilestone: "Milestone",
  percentComplete: "Progress %",
};

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.join(", ");
  }

  const str = String(value);

  // Parse ISO date strings
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try {
      return new Date(str).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return str;
    }
  }

  // Format enum values
  if (/^[A-Z_]+$/.test(str)) {
    return str
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }

  return str;
}

export function SnapshotDiff({
  taskId,
  snapshotId,
  className,
}: SnapshotDiffProps) {
  const [data, setData] = useState<SnapshotDiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/tasks/${taskId}/snapshots/${snapshotId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load snapshot diff");
        return res.json();
      })
      .then((result: SnapshotDiffData) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, snapshotId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-destructive py-4 text-center">
        {error ?? "Failed to load diff"}
      </div>
    );
  }

  if (!data.hasChanges) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-6 text-center",
          className
        )}
      >
        <CheckCircle className="h-8 w-8 text-green-500/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          Current state matches this snapshot
        </p>
      </div>
    );
  }

  const changedFields = Object.keys(data.changes);
  const allFields = Object.keys(FIELD_LABELS);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {changedFields.length} field{changedFields.length !== 1 ? "s" : ""}{" "}
          changed since snapshot
        </span>
      </div>

      {/* Changed fields - inline diff format using DiffDisplay pattern */}
      <div className="space-y-1">
        {changedFields.map((field) => {
          const change = data.changes[field];
          return (
            <div
              key={field}
              className="text-xs font-mono bg-muted/50 rounded px-2 py-1"
            >
              <span className="text-muted-foreground">
                {formatFieldChange(field, change.old, change.new)}
              </span>
            </div>
          );
        })}
      </div>

      <Separator />

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4 text-xs">
        {/* Column headers */}
        <div className="font-semibold text-muted-foreground pb-1 border-b">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Snapshot
          </Badge>
          <span className="ml-2">
            {new Date(data.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="font-semibold text-muted-foreground pb-1 border-b">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Current
          </Badge>
          <span className="ml-2">Now</span>
        </div>

        {/* Field rows */}
        {allFields.map((field) => {
          const isChanged = field in data.changes;
          const snapshotVal =
            data.snapshotState[field as keyof typeof data.snapshotState];
          const currentVal =
            data.currentState[field as keyof typeof data.currentState];

          return (
            <div key={field} className="contents">
              {/* Snapshot value */}
              <div
                className={cn(
                  "py-1 px-2 rounded-l",
                  isChanged && "bg-red-500/10"
                )}
              >
                <span className="text-muted-foreground block mb-0.5">
                  {FIELD_LABELS[field] ?? field}
                </span>
                <span className={cn(isChanged && "text-red-600 dark:text-red-400")}>
                  {formatDisplayValue(snapshotVal)}
                </span>
              </div>

              {/* Current value */}
              <div
                className={cn(
                  "py-1 px-2 rounded-r",
                  isChanged && "bg-green-500/10"
                )}
              >
                <span className="text-muted-foreground block mb-0.5">
                  {FIELD_LABELS[field] ?? field}
                </span>
                <span
                  className={cn(
                    isChanged && "text-green-600 dark:text-green-400"
                  )}
                >
                  {formatDisplayValue(currentVal)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
