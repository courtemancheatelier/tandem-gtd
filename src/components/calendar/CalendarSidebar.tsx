"use client";

import { useState, useEffect, useCallback } from "react";
import { useCalendarSidebar } from "@/contexts/CalendarSidebarContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { CalendarEventDialog } from "./CalendarEventDialog";
import { useToast } from "@/components/ui/use-toast";

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
  // month
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatDateHeader(view: CalendarView, date: Date): string {
  if (view === "day") {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
  if (view === "week") {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

type SyncStatus = "connected" | "error" | "disconnected";

export function CalendarSidebar() {
  const { isOpen, view, selectedDate, toggle, setView, setSelectedDate, registerRefresh } = useCalendarSidebar();
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState<string | undefined>();
  const [dialogDefaultTime, setDialogDefaultTime] = useState<string | undefined>();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("disconnected");
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const fetchEvents = useCallback(async () => {
    const { start, end } = getViewRange(view, selectedDate);
    try {
      const res = await fetch(
        `/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}&includeExternal=true`
      );
      if (res.ok) {
        setEvents(await res.json());
        setLastFetchTime(Date.now());
      }
    } catch {}
  }, [view, selectedDate]);

  useEffect(() => {
    registerRefresh(fetchEvents);
  }, [registerRefresh, fetchEvents]);

  useEffect(() => {
    if (isOpen) fetchEvents();
  }, [isOpen, fetchEvents]);

  // Auto-refresh if data is stale (>15 minutes)
  useEffect(() => {
    if (!isOpen) return;
    const STALE_MS = 15 * 60 * 1000;
    const interval = setInterval(() => {
      if (lastFetchTime && Date.now() - lastFetchTime > STALE_MS) {
        fetchEvents();
      }
    }, 60_000); // Check every minute
    return () => clearInterval(interval);
  }, [isOpen, lastFetchTime, fetchEvents]);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/calendar/google/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (!data.connected) setSyncStatus("disconnected");
        else if (data.consecutiveErrors > 0) setSyncStatus("error");
        else setSyncStatus("connected");
      })
      .catch(() => {});
  }, [isOpen]);

  const handleTaskDrop = useCallback(async (
    dropDate: Date,
    hour: number,
    taskData: { taskId: string; title: string; estimatedMins?: number }
  ) => {
    const startTime = new Date(dropDate);
    startTime.setHours(hour, 0, 0, 0);
    const durationMinutes = taskData.estimatedMins || 60;

    try {
      const res = await fetch("/api/calendar/time-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: taskData.taskId,
          date: dropDate.toISOString(),
          startTime: startTime.toISOString(),
          durationMinutes,
        }),
      });
      if (res.ok) {
        toast({ title: "Time block created", description: `${taskData.title} at ${hour === 0 ? "12 AM" : hour <= 11 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}` });
        await fetchEvents();
      } else {
        toast({ title: "Failed to create time block", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to create time block", variant: "destructive" });
    }
  }, [fetchEvents, toast]);

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

  async function handleEventTimeChange(eventId: string, date: Date, startTime: string, endTime: string) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const startDateTime = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const endDateTime = new Date(`${dateStr}T${endTime}:00`).toISOString();
    await fetch(`/api/calendar/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr, startTime: startDateTime, endTime: endDateTime }),
    });
    await fetchEvents();
  }

  function handleDayClick(date: Date) {
    setSelectedDate(date);
    setView("day");
  }

  if (!isOpen) {
    return (
      <div className="hidden md:flex items-start pt-3 pr-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={toggle}
          title="Open calendar"
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <aside className="hidden md:flex flex-col w-[280px] shrink-0 border-l bg-card h-full">
        {/* Header */}
        <div className="border-b px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold">Calendar</h2>
              {syncStatus === "connected" && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" title="Google Calendar synced" />
              )}
              {syncStatus === "error" && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" title="Google Calendar sync error" />
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={toggle}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setSelectedDate(navigateDate(view, selectedDate, -1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <button
              className="text-xs font-medium hover:text-primary transition-colors"
              onClick={() => setSelectedDate(new Date())}
            >
              {formatDateHeader(view, selectedDate)}
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setSelectedDate(navigateDate(view, selectedDate, 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* View toggle */}
          <div className="flex gap-1">
            {(["day", "week", "month"] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "flex-1 text-xs py-1 rounded transition-colors",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {view === "day" && (
            <DayView
              date={selectedDate}
              events={events}
              onEventClick={openEditEvent}
              onSlotClick={handleSlotClick}
              onTaskDrop={(hour, taskData) => handleTaskDrop(selectedDate, hour, taskData)}
              onEventTimeChange={(eventId, startTime, endTime) => handleEventTimeChange(eventId, selectedDate, startTime, endTime)}
            />
          )}
          {view === "week" && (
            <WeekView
              startOfWeek={getStartOfWeek(selectedDate)}
              events={events}
              onDayClick={handleDayClick}
              onEventClick={openEditEvent}
              onTaskDrop={(date, taskData) => handleTaskDrop(date, 9, taskData)}
              onEventTimeChange={handleEventTimeChange}
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

        {/* Footer */}
        <div className="border-t p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => openNewEvent()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Event
          </Button>
        </div>
      </aside>

      <CalendarEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        defaultDate={dialogDefaultDate}
        defaultTime={dialogDefaultTime}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  );
}
