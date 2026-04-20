"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { EventItem, type EventItemData } from "./EventItem";
import { groupEventsByDate } from "@/lib/history/format";
import { History, Loader2, ChevronDown } from "lucide-react";

interface TaskTimelineProps {
  taskId: string;
  defaultCollapsed?: boolean;
  initialLimit?: number;
}

export function TaskTimeline({
  taskId,
  defaultCollapsed = true,
  initialLimit = 5,
}: TaskTimelineProps) {
  const [events, setEvents] = useState<EventItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(!defaultCollapsed);

  const fetchEvents = useCallback(
    async (before?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (before) params.set("before", before);

      const res = await fetch(`/api/tasks/${taskId}/history?${params}`);
      if (!res.ok) return { events: [], hasMore: false };

      const data = await res.json();
      return data as { events: EventItemData[]; hasMore: boolean };
    },
    [taskId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchEvents().then((data) => {
      if (cancelled) return;
      setEvents(data.events);
      setHasMore(data.hasMore);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchEvents]);

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);

    const lastEvent = events[events.length - 1];
    const data = await fetchEvents(lastEvent?.createdAt);

    setEvents((prev) => [...prev, ...data.events]);
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }

  // Display either all or just the initial limit
  const displayEvents = expanded ? events : events.slice(0, initialLimit);

  // Group by date
  const grouped = groupEventsByDate(displayEvents);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Timeline container */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />

        {Array.from(grouped.entries()).map(([dateLabel, dateEvents]) => (
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

            {/* Events for this date */}
            {dateEvents.map((event) => (
              <EventItem
                key={event.id}
                event={event}
                isCascadeChild={!!event.triggeredBy}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Show more / collapse controls */}
      <div className="flex items-center gap-2 pt-2">
        {!expanded && events.length > initialLimit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setExpanded(true)}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Show {events.length - initialLimit} more
          </Button>
        )}
        {expanded && events.length > initialLimit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setExpanded(false)}
          >
            Show less
          </Button>
        )}
        {expanded && hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <ChevronDown className="h-3 w-3 mr-1" />
            )}
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
