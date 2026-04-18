"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventItem, type EventItemData } from "./EventItem";
import { groupEventsByDate } from "@/lib/history/format";
import { History, Loader2, ChevronDown } from "lucide-react";

type SourceFilter = "all" | "MANUAL" | "CASCADE" | "AI";

interface ActivityFeedProps {
  initialLimit?: number;
  entityTypes?: string[];
  className?: string;
}

export function ActivityFeed({
  initialLimit = 20,
  entityTypes,
  className,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<EventItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const fetchEvents = useCallback(
    async (before?: string, source?: SourceFilter) => {
      const params = new URLSearchParams();
      params.set("limit", String(initialLimit));
      if (before) params.set("before", before);
      if (entityTypes) params.set("entityTypes", entityTypes.join(","));

      // Map source filter to API params
      if (source && source !== "all") {
        if (source === "AI") {
          // AI filter: we'll filter client-side since API filters by source not actorType
          // Just fetch all and filter
        } else {
          params.set("sources", source);
        }
      }

      const res = await fetch(`/api/history/feed?${params}`);
      if (!res.ok) return { events: [], hasMore: false };

      const data = await res.json();
      return data as { events: EventItemData[]; hasMore: boolean };
    },
    [initialLimit, entityTypes]
  );

  const loadEvents = useCallback(
    async (source: SourceFilter) => {
      setLoading(true);
      const data = await fetchEvents(undefined, source);
      setEvents(data.events);
      setHasMore(data.hasMore);
      setLoading(false);
    },
    [fetchEvents]
  );

  useEffect(() => {
    loadEvents(sourceFilter);
  }, [loadEvents, sourceFilter]);

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);

    const lastEvent = events[events.length - 1];
    const data = await fetchEvents(lastEvent?.createdAt, sourceFilter);

    setEvents((prev) => [...prev, ...data.events]);
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }

  function handleFilterChange(value: string) {
    setSourceFilter(value as SourceFilter);
  }

  // Client-side filtering for AI (since API doesn't support actorType filter directly)
  const filteredEvents =
    sourceFilter === "AI"
      ? events.filter((e) => e.actorType === "AI")
      : events;

  const grouped = groupEventsByDate(filteredEvents);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filter tabs */}
      <Tabs
        value={sourceFilter}
        onValueChange={handleFilterChange}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="MANUAL">Manual</TabsTrigger>
          <TabsTrigger value="CASCADE">Cascade</TabsTrigger>
          <TabsTrigger value="AI">AI</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <History className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No activity to show</p>
          <p className="text-xs text-muted-foreground mt-1">
            Events will appear here as you work with tasks and projects.
          </p>
        </div>
      )}

      {/* Feed */}
      {!loading && filteredEvents.length > 0 && (
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

              {/* Events */}
              {dateEvents.map((event) => (
                <EventItem
                  key={event.id}
                  event={event}
                  showEntity
                  isCascadeChild={!!event.triggeredBy}
                />
              ))}
            </div>
          ))}

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
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
