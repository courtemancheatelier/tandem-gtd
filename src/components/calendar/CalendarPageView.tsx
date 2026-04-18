"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { CalendarEventDialog } from "./CalendarEventDialog";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  eventType: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  reminderMinutes?: number | null;
  syncStatus?: string;
  taskId?: string | null;
  projectId?: string | null;
  task?: { id: string; title: string } | null;
  project?: { id: string; title: string } | null;
}

type CalendarView = "day" | "week" | "month";

const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getViewRange(view: CalendarView, date: Date): { start: Date; end: Date } {
  if (view === "day") {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (view === "week") {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatDateHeader(view: CalendarView, date: Date): string {
  if (view === "day") {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "week") {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${startStr} – ${endStr}`;
  }
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function navigateDate(view: CalendarView, date: Date, direction: number): Date {
  const d = new Date(date);
  if (view === "day") d.setDate(d.getDate() + direction);
  else if (view === "week") d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  return d;
}

export function CalendarPageView() {
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState<string | undefined>();
  const [dialogDefaultTime, setDialogDefaultTime] = useState<string | undefined>();
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  // Trigger Google Calendar read sync (fire-and-forget, debounced server-side)
  const triggerReadSync = useCallback(async () => {
    try {
      await fetch("/api/calendar/google/read-sync", { method: "POST" });
    } catch {}
  }, []);

  const fetchEvents = useCallback(async () => {
    const { start, end } = getViewRange(view, selectedDate);
    try {
      const res = await fetch(
        `/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}&includeExternal=true`
      );
      if (res.ok) setEvents(await res.json());
    } catch {}
  }, [view, selectedDate]);

  // Auto-sync from Google on mount, then fetch events
  useEffect(() => {
    triggerReadSync().then(() => fetchEvents());
  }, [triggerReadSync, fetchEvents]);

  async function handleManualSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/google/read-sync?force=true", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.debounced) {
          toast({ description: "Sync throttled — try again in a few minutes" });
        } else {
          toast({ description: `Synced: ${data.upserted} updated, ${data.deleted} removed` });
        }
      }
      await fetchEvents();
    } catch {
      toast({ description: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave(data: {
    id?: string;
    title: string;
    eventType: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    allDay?: boolean;
    location?: string | null;
    description?: string | null;
    reminderMinutes?: number | null;
    taskId?: string | null;
    projectId?: string | null;
  }) {
    if (data.id) {
      await fetch(`/api/calendar/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    await fetchEvents();
  }

  async function handleDelete(id: string, scope?: "this" | "future" | "all") {
    const params = scope ? `?deleteScope=${scope}` : "";
    await fetch(`/api/calendar/${id}${params}`, { method: "DELETE" });
    await fetchEvents();
  }

  function openNewEvent(date?: string, time?: string) {
    setEditingEvent(null);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setDialogDefaultDate(date || todayStr);
    setDialogDefaultTime(time);
    setDialogOpen(true);
  }

  function openEditEvent(event: CalendarEvent) {
    if (event.syncStatus === "EXTERNAL" || event.syncStatus === "TASK_DEADLINE") return;
    setEditingEvent(event);
    setDialogOpen(true);
  }

  function handleSlotClick(hour: number) {
    const h = String(hour).padStart(2, "0");
    openNewEvent(selectedDate.toISOString().slice(0, 10), `${h}:00`);
  }

  function handleWeekSlotClick(hour: number, date: Date) {
    const h = String(hour).padStart(2, "0");
    openNewEvent(date.toISOString().slice(0, 10), `${h}:00`);
  }

  async function handleEventTimeChange(eventId: string, startTime: string, endTime: string) {
    const dateStr = selectedDate.toISOString().slice(0, 10);
    const startDateTime = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const endDateTime = new Date(`${dateStr}T${endTime}:00`).toISOString();
    await fetch(`/api/calendar/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime: startDateTime, endTime: endDateTime }),
    });
    await fetchEvents();
  }

  async function handleWeekEventTimeChange(eventId: string, date: Date, startTime: string, endTime: string) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const startDateTime = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const endDateTime = new Date(`${dateStr}T${endTime}:00`).toISOString();
    await fetch(`/api/calendar/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime: startDateTime, endTime: endDateTime }),
    });
    await fetchEvents();
  }

  function handleDayClick(date: Date) {
    setSelectedDate(date);
    setView("day");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            {formatDateHeader(view, selectedDate)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex gap-1 border rounded-md p-0.5">
            {(["day", "week", "month"] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSelectedDate(navigateDate(view, selectedDate, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSelectedDate(navigateDate(view, selectedDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleManualSync}
            disabled={syncing}
            title="Sync from Google Calendar"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          </Button>

          <Button size="sm" onClick={() => openNewEvent()}>
            <Plus className="h-4 w-4 mr-1" />
            New Event
          </Button>
        </div>
      </div>

      {/* Calendar body */}
      <div className="border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 12rem)" }}>
        {view === "day" && (
          <DayView
            date={selectedDate}
            events={events}
            onEventClick={openEditEvent}
            onSlotClick={handleSlotClick}
            onEventTimeChange={handleEventTimeChange}
          />
        )}
        {view === "week" && (
          <WeekView
            startOfWeek={getStartOfWeek(selectedDate)}
            events={events}
            onDayClick={handleDayClick}
            onEventClick={openEditEvent}
            onSlotClick={handleWeekSlotClick}
            onEventTimeChange={handleWeekEventTimeChange}
          />
        )}
        {view === "month" && (
          <MonthView
            year={selectedDate.getFullYear()}
            month={selectedDate.getMonth()}
            events={events}
            selectedDate={selectedDate}
            onDayClick={handleDayClick}
            onEventClick={openEditEvent}
          />
        )}
      </div>

      <CalendarEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        defaultDate={dialogDefaultDate}
        defaultTime={dialogDefaultTime}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
