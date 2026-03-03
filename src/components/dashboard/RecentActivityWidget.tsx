"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EventItem, type EventItemData } from "@/components/history/EventItem";
import { History, Loader2 } from "lucide-react";

export function RecentActivityWidget() {
  const [events, setEvents] = useState<EventItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history/feed?limit=15")
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => setEvents(data.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Link
            href="/activity"
            className="text-xs text-primary hover:text-primary/80 hover:underline shrink-0"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-6">
            <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Events will appear here as you work with tasks and projects.
            </p>
          </div>
        )}
        {!loading && events.length > 0 && (
          <ScrollArea className="h-[300px] px-6 pb-6">
            <div className="relative">
              <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
              {events.map((event) => (
                <EventItem
                  key={event.id}
                  event={event}
                  showEntity
                  isCascadeChild={!!event.triggeredBy}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
