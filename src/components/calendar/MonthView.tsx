"use client";

import { cn } from "@/lib/utils";
import { CalendarEventCard } from "./CalendarEventCard";

interface CalendarEvent {
  id: string;
  title: string;
  eventType: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  syncStatus?: string;
  task?: { id: string; title: string } | null;
  project?: { id: string; title: string } | null;
}

interface MonthViewProps {
  year: number;
  month: number; // 0-indexed
  events: CalendarEvent[];
  selectedDate: Date;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sortByTime(a: CalendarEvent, b: CalendarEvent): number {
  // All-day events first, then by start time
  const aAllDay = a.allDay || a.eventType === "DAY_SPECIFIC" || a.eventType === "INFORMATION";
  const bAllDay = b.allDay || b.eventType === "DAY_SPECIFIC" || b.eventType === "INFORMATION";
  if (aAllDay && !bAllDay) return -1;
  if (!aAllDay && bAllDay) return 1;
  if (a.startTime && b.startTime) return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  return 0;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_EVENTS = 3;

export function MonthView({ year, month, events, selectedDate, onDayClick, onEventClick }: MonthViewProps) {
  const days = getDaysInMonth(year, month);
  const firstDayOfWeek = days[0].getDay();
  const today = new Date();
  const totalCells = firstDayOfWeek + days.length;
  const rows = Math.ceil(totalCells / 7);

  // Group events by date key
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const existing = eventsByDate.get(key) || [];
    existing.push(e);
    eventsByDate.set(key, existing);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {DAY_HEADERS.map((dh) => (
          <div key={dh} className="text-center text-xs text-muted-foreground font-medium py-2 border-r last:border-r-0">
            {dh}
          </div>
        ))}
      </div>

      {/* Calendar grid — equal-height rows filling the container */}
      <div
        className="flex-1 grid grid-cols-7"
        style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="border-r border-b bg-muted/20" />
        ))}

        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayEvents = (eventsByDate.get(key) || []).sort(sortByTime);
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
          const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

          return (
            <div
              key={day.getDate()}
              className={cn(
                "border-r border-b last:border-r-0 p-1 cursor-pointer hover:bg-accent/30 transition-colors overflow-hidden flex flex-col",
                isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/30"
              )}
              onClick={() => onDayClick(day)}
            >
              <div
                className={cn(
                  "text-xs font-medium mb-0.5 shrink-0",
                  isToday && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                  !isToday && "pl-0.5"
                )}
              >
                {day.getDate()}
              </div>
              <div className="flex-1 space-y-0.5 overflow-hidden">
                {visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-1"
                  >
                    <CalendarEventCard event={event} onDoubleClick={() => onEventClick(event)} compact />
                  </div>
                ))}
                {overflow > 0 && (
                  <p className="text-[10px] text-muted-foreground pl-0.5">
                    +{overflow} more
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Trailing empty cells to complete the last row */}
        {Array.from({ length: rows * 7 - totalCells }).map((_, i) => (
          <div key={`trail-${i}`} className="border-r border-b bg-muted/20" />
        ))}
      </div>
    </div>
  );
}
