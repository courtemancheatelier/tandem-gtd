"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface CalendarEvent {
  id: string;
  title: string;
  eventType: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  syncStatus: string;
  task?: { id: string; title: string } | null;
  project?: { id: string; title: string } | null;
}

interface DayGroup {
  date: string;
  events: CalendarEvent[];
}

interface ReviewCalendarPanelProps {
  direction: "past" | "upcoming";
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const dayName = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  if (diff === 0) return `Today — ${dayName}`;
  if (diff === -1) return `Yesterday — ${dayName}`;
  if (diff === 1) return `Tomorrow — ${dayName}`;
  return dayName;
}

export function ReviewCalendarPanel({ direction }: ReviewCalendarPanelProps) {
  const { toast } = useToast();
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch(`/api/calendar/review?direction=${direction}`);
        if (res.ok) {
          setDays(await res.json());
        }
      } catch {}
      setLoading(false);
    }
    fetchEvents();
  }, [direction]);

  async function handleFollowUp(event: CalendarEvent) {
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Follow up: ${event.title}`,
          notes: `From calendar event on ${event.date.slice(0, 10)}`,
        }),
      });
      if (res.ok) {
        toast({ title: "Added to inbox", description: `Follow-up for "${event.title}" added.` });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add inbox item.", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading calendar...
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No events {direction === "past" ? "in the past 7 days" : "in the next 14 days"}.
      </p>
    );
  }

  return (
    <div className="space-y-3 py-2">
      {days.map((day) => (
        <div key={day.date}>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {formatDateHeader(day.date)}
          </p>
          <div className="space-y-1">
            {day.events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {event.syncStatus === "EXTERNAL" && (
                    <ExternalLink className="h-3 w-3 text-purple-500 shrink-0" />
                  )}
                  <span className="text-sm truncate">{event.title}</span>
                  {event.startTime && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(event.startTime)}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => handleFollowUp(event)}
                  title="Add follow-up to inbox"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
