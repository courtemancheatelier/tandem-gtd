"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SnapshotDiff } from "./SnapshotDiff";
import { RevertConfirmDialog } from "./RevertConfirmDialog";
import {
  formatEventDescription,
  formatRelativeTime,
  formatTimeOnly,
  groupEventsByDate,
} from "@/lib/history/format";
import {
  History,
  RotateCcw,
  GitCompare,
  Loader2,
  ChevronDown,
  ChevronRight,
  Camera,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface SnapshotEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorName: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  message: string | null;
  source: string;
  createdAt: string;
}

interface SnapshotItem {
  id: string;
  taskId: string;
  state: Record<string, unknown>;
  reason: string;
  eventId: string | null;
  createdAt: string;
  event: SnapshotEvent | null;
}

interface SnapshotsResponse {
  snapshots: SnapshotItem[];
  total: number;
  hasMore: boolean;
}

interface SnapshotDiffResponse {
  changes: Record<string, { old: unknown; new: unknown }>;
  hasChanges: boolean;
}

// ─── Reason Labels ──────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  COMPLETION: "Task completed",
  WEEKLY_REVIEW: "Weekly review",
  BULK_OPERATION: "Bulk operation",
  MANUAL: "Manual snapshot",
  REVERT_POINT: "Revert point",
};

const REASON_COLORS: Record<string, string> = {
  COMPLETION: "border-green-500/50 text-green-600",
  WEEKLY_REVIEW: "border-blue-500/50 text-blue-600",
  BULK_OPERATION: "border-orange-500/50 text-orange-600",
  MANUAL: "border-gray-500/50 text-gray-600",
  REVERT_POINT: "border-purple-500/50 text-purple-600",
};

// ─── Component ──────────────────────────────────────────────────────

interface SnapshotTimelineProps {
  taskId: string;
  className?: string;
}

export function SnapshotTimeline({ taskId, className }: SnapshotTimelineProps) {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Expanded snapshot (shows diff)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Revert dialog state
  const [revertSnapshot, setRevertSnapshot] = useState<SnapshotItem | null>(
    null
  );
  const [revertChanges, setRevertChanges] = useState<
    Record<string, { old: unknown; new: unknown }>
  >({});
  const [loadingRevertPreview, setLoadingRevertPreview] = useState(false);

  // ── Fetch snapshots ────────────────────────────────────────────────

  const fetchSnapshots = useCallback(
    async (offset = 0) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("offset", String(offset));

      const res = await fetch(`/api/tasks/${taskId}/snapshots?${params}`);
      if (!res.ok) return { snapshots: [], total: 0, hasMore: false };

      return (await res.json()) as SnapshotsResponse;
    },
    [taskId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSnapshots().then((data) => {
      if (cancelled) return;
      setSnapshots(data.snapshots);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchSnapshots]);

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);

    const data = await fetchSnapshots(snapshots.length);
    setSnapshots((prev) => [...prev, ...data.snapshots]);
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }

  // ── Toggle diff view ───────────────────────────────────────────────

  function toggleExpanded(snapshotId: string) {
    setExpandedId((prev) => (prev === snapshotId ? null : snapshotId));
  }

  // ── Revert flow ────────────────────────────────────────────────────

  async function handleRevertClick(snapshot: SnapshotItem) {
    setLoadingRevertPreview(true);
    setRevertSnapshot(snapshot);

    try {
      const res = await fetch(
        `/api/tasks/${taskId}/snapshots/${snapshot.id}`
      );
      if (!res.ok) throw new Error("Failed to load diff");

      const data = (await res.json()) as SnapshotDiffResponse;
      setRevertChanges(data.changes);
    } catch {
      // If we can't load the diff, still show the dialog with empty changes
      setRevertChanges({});
    } finally {
      setLoadingRevertPreview(false);
    }
  }

  async function handleRevertConfirm() {
    if (!revertSnapshot) return;

    const res = await fetch(`/api/tasks/${taskId}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId: revertSnapshot.id }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Revert failed");
    }

    // Refresh snapshots after successful revert
    const freshData = await fetchSnapshots();
    setSnapshots(freshData.snapshots);
    setTotal(freshData.total);
    setHasMore(freshData.hasMore);
    setRevertSnapshot(null);
    setRevertChanges({});
  }

  // ── Render helpers ─────────────────────────────────────────────────

  function renderSnapshotSummary(snapshot: SnapshotItem) {
    // Use the event changes to build a summary of what triggered the snapshot
    if (snapshot.event) {
      const event = snapshot.event;
      const description = formatEventDescription({
        eventType: event.eventType,
        changes: event.changes ?? {},
        actorType: event.actorType,
        source: event.source,
      });
      return description;
    }

    return REASON_LABELS[snapshot.reason] ?? snapshot.reason;
  }

  // ── Group by date ──────────────────────────────────────────────────

  const grouped = groupEventsByDate(snapshots);

  // ── Loading state ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────

  if (snapshots.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-8 text-center",
          className
        )}
      >
        <Camera className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          No snapshots yet
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Snapshots are taken automatically before task changes, allowing you to
          revert to previous states.
        </p>
      </div>
    );
  }

  // ── Timeline ───────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-0", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {total} snapshot{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Timeline container */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />

        {Array.from(grouped.entries()).map(([dateLabel, dateSnapshots]) => (
          <div key={dateLabel}>
            {/* Date separator */}
            <div className="relative flex items-center py-2">
              <div className="z-10 bg-background pr-2 pl-8">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {dateLabel}
                </span>
              </div>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Snapshots for this date */}
            {dateSnapshots.map((snapshot) => (
              <div key={snapshot.id} className="group relative">
                <div className="flex items-start gap-3 py-2">
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background",
                      snapshot.reason === "REVERT_POINT" &&
                        "border-purple-500/50",
                      snapshot.reason === "COMPLETION" &&
                        "border-green-500/50"
                    )}
                  >
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Summary line */}
                    <p className="text-sm text-foreground">
                      {renderSnapshotSummary(snapshot)}
                    </p>

                    {/* Meta line */}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeOnly(snapshot.createdAt)}
                      </span>

                      {/* Reason badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          REASON_COLORS[snapshot.reason] ??
                            "border-gray-500/50 text-gray-600"
                        )}
                      >
                        {REASON_LABELS[snapshot.reason] ?? snapshot.reason}
                      </Badge>

                      {/* Actor name from event */}
                      {snapshot.event && (
                        <span className="text-xs text-muted-foreground">
                          &mdash; {snapshot.event.actorName}
                        </span>
                      )}

                      {/* Toggle diff */}
                      <button
                        onClick={() => toggleExpanded(snapshot.id)}
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedId === snapshot.id ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <GitCompare className="h-3 w-3 mr-0.5" />
                        diff
                      </button>
                    </div>

                    {/* Expanded diff view */}
                    {expandedId === snapshot.id && (
                      <Card className="mt-3 border-dashed">
                        <CardContent className="pt-4 pb-3">
                          <SnapshotDiff
                            taskId={taskId}
                            snapshotId={snapshot.id}
                          />
                        </CardContent>
                      </Card>
                    )}

                    {/* Revert button */}
                    <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleRevertClick(snapshot)}
                        disabled={loadingRevertPreview}
                      >
                        {loadingRevertPreview &&
                        revertSnapshot?.id === snapshot.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Revert to this version
                      </Button>
                    </div>
                  </div>

                  {/* Relative time (right side) */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(snapshot.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="pt-4 pl-8">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full"
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 mr-2" />
            )}
            Load more snapshots
          </Button>
        </div>
      )}

      {/* Revert confirmation dialog */}
      {revertSnapshot && !loadingRevertPreview && (
        <RevertConfirmDialog
          open={!!revertSnapshot}
          onOpenChange={(open) => {
            if (!open) {
              setRevertSnapshot(null);
              setRevertChanges({});
            }
          }}
          snapshotId={revertSnapshot.id}
          taskId={taskId}
          snapshotDate={revertSnapshot.createdAt}
          changes={revertChanges}
          onConfirm={handleRevertConfirm}
        />
      )}
    </div>
  );
}
