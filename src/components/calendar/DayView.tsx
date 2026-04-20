"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CalendarEventCard } from "./CalendarEventCard";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  eventType: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  color?: string | null;
  syncStatus?: string;
  task?: { id: string; title: string } | null;
  project?: { id: string; title: string } | null;
}

interface TaskDropData {
  taskId: string;
  title: string;
  estimatedMins?: number;
}

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (hour: number) => void;
  onTaskDrop?: (hour: number, taskData: TaskDropData) => void;
  onEventTimeChange?: (eventId: string, startTime: string, endTime: string) => void;
}

const FIRST_HOUR = 0;
const LAST_HOUR = 23;
const TOTAL_HOURS = LAST_HOUR - FIRST_HOUR + 1;
const HOUR_HEIGHT = 60;
const SNAP_MINUTES = 15;
const SNAP_PX = (SNAP_MINUTES / 60) * HOUR_HEIGHT;
const DRAG_THRESHOLD = 4; // pixels before drag activates
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i + FIRST_HOUR);

function getMinutesSinceMidnight(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getHours() * 60 + d.getMinutes();
}

function snapToGrid(px: number): number {
  return Math.round(px / SNAP_PX) * SNAP_PX;
}

function pxToMinutes(px: number): number {
  return (px / HOUR_HEIGHT) * 60 + FIRST_HOUR * 60;
}

function minutesToTimeStr(totalMins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, totalMins));
  const h = Math.floor(clamped / 60);
  const m = Math.round(clamped % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour <= 11) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTimeShort(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface DragState {
  eventId: string;
  mode: "move" | "resize";
  startY: number;
  origTopPx: number;
  origHeightPx: number;
  activated: boolean; // true once threshold exceeded
}

export function DayView({ date, events, onEventClick, onSlotClick, onTaskDrop, onEventTimeChange }: DayViewProps) {
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ topPx: number; heightPx: number } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Filter events relevant to this day (including cross-midnight continuations)
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const relevantEvents = events.filter((e) => {
    // Event is on this day
    if (new Date(e.date).toDateString() === date.toDateString()) return true;
    // Cross-midnight: started before this day, endTime extends into this day
    if (e.startTime && e.endTime) {
      const startDate = new Date(e.startTime);
      const endDate = new Date(e.endTime);
      if (startDate < dayStart && endDate > dayStart) return true;
    }
    return false;
  });

  const allDayEvents = relevantEvents.filter(
    (e) => e.allDay || e.eventType === "DAY_SPECIFIC" || e.eventType === "INFORMATION"
    || e.syncStatus === "TASK_DEADLINE"
  );
  const timedEvents = relevantEvents.filter(
    (e) => !e.allDay && e.syncStatus !== "TASK_DEADLINE"
    && (e.eventType === "TIME_SPECIFIC" || e.eventType === "TIME_BLOCK") && e.startTime
  );

  const isToday = new Date().toDateString() === date.toDateString();
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const canDrag = useCallback((event: CalendarEvent) => {
    return event.syncStatus !== "EXTERNAL" && event.syncStatus !== "TASK_DEADLINE" && !!onEventTimeChange;
  }, [onEventTimeChange]);

  // Use document-level mouse events for reliable drag handling
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaY = e.clientY - drag.startY;

      // Check threshold
      if (!drag.activated) {
        if (Math.abs(deltaY) < DRAG_THRESHOLD) return;
        drag.activated = true;
        setIsDragActive(true);
      }

      e.preventDefault();
      const totalGridHeight = TOTAL_HOURS * HOUR_HEIGHT;

      if (drag.mode === "move") {
        const newTop = snapToGrid(drag.origTopPx + deltaY);
        const clampedTop = Math.max(0, Math.min(totalGridHeight - drag.origHeightPx, newTop));
        setDragPreview({ topPx: clampedTop, heightPx: drag.origHeightPx });
      } else {
        const newHeight = snapToGrid(drag.origHeightPx + deltaY);
        const minHeight = SNAP_PX;
        const maxHeight = totalGridHeight - drag.origTopPx;
        const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
        setDragPreview({ topPx: drag.origTopPx, heightPx: clampedHeight });
      }
    }

    function onMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const wasActivated = drag.activated;
      dragRef.current = null;
      setIsDragActive(false);

      if (!wasActivated) {
        setDragPreview(null);
        return;
      }

      e.preventDefault();

      // Compute from the current drag state
      const finalTopPx = drag.mode === "move"
        ? snapToGrid(drag.origTopPx + (e.clientY - drag.startY))
        : drag.origTopPx;
      const finalHeightPx = drag.mode === "resize"
        ? snapToGrid(drag.origHeightPx + (e.clientY - drag.startY))
        : drag.origHeightPx;

      const totalGridHeight = TOTAL_HOURS * HOUR_HEIGHT;
      const clampedTop = Math.max(0, Math.min(totalGridHeight - finalHeightPx, finalTopPx));
      const clampedHeight = Math.max(SNAP_PX, Math.min(totalGridHeight - clampedTop, finalHeightPx));

      const startMins = Math.round(pxToMinutes(clampedTop));
      const endMins = Math.round(pxToMinutes(clampedTop + clampedHeight));

      const event = timedEvents.find((ev) => ev.id === drag.eventId);
      if (event && onEventTimeChange) {
        const origStart = getMinutesSinceMidnight(event.startTime!);
        const origEnd = event.endTime ? getMinutesSinceMidnight(event.endTime) : origStart + 60;
        if (startMins !== origStart || endMins !== origEnd) {
          onEventTimeChange(drag.eventId, minutesToTimeStr(startMins), minutesToTimeStr(endMins));
        }
      }

      setDragPreview(null);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [timedEvents, onEventTimeChange]);

  function startDrag(e: React.MouseEvent, event: CalendarEvent, mode: "move" | "resize") {
    if (!canDrag(event)) return;
    e.preventDefault(); // prevent button default behavior
    e.stopPropagation();

    const startMins = getMinutesSinceMidnight(event.startTime!);
    const endMins = event.endTime ? getMinutesSinceMidnight(event.endTime) : startMins + 60;
    const durationMins = Math.max(endMins - startMins, SNAP_MINUTES);

    const topPx = ((startMins / 60) - FIRST_HOUR) * HOUR_HEIGHT;
    const heightPx = (durationMins / 60) * HOUR_HEIGHT;

    dragRef.current = {
      eventId: event.id,
      mode,
      startY: e.clientY,
      origTopPx: topPx,
      origHeightPx: heightPx,
      activated: false,
    };
    setDragPreview({ topPx, heightPx });
  }

  return (
    <div className="flex flex-col h-full select-none">
      {/* All-day section */}
      {allDayEvents.length > 0 && (
        <div className="border-b px-2 py-1 space-y-px shrink-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase">All day</p>
          {allDayEvents.map((event) => (
            <div key={event.id} className="h-[18px]">
              <CalendarEventCard
                event={event}
                onDoubleClick={() => onEventClick(event)}
                compact
              />
            </div>
          ))}
        </div>
      )}

      {/* Hourly timeline */}
      <div className="flex-1 overflow-y-auto relative" ref={containerRef}>
        <div className="flex" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Hour labels column */}
          <div className="w-12 shrink-0 relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute text-[10px] text-muted-foreground text-right pr-2 w-full"
                style={{ top: (hour - FIRST_HOUR) * HOUR_HEIGHT }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {/* Time grid + events */}
          <div className="flex-1 border-l relative">
            {/* Hour grid lines + click targets */}
            {HOURS.map((hour) => {
              const isDragOver = dragOverHour === hour;
              const isCurrentHour = isToday && now.getHours() === hour;

              return (
                <div
                  key={hour}
                  className={cn(
                    "absolute w-full border-b cursor-pointer hover:bg-accent/20 transition-colors",
                    isCurrentHour && "bg-primary/5",
                    isDragOver && "bg-primary/10 ring-1 ring-inset ring-primary/40"
                  )}
                  style={{
                    top: (hour - FIRST_HOUR) * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                  }}
                  onClick={() => !isDragActive && onSlotClick(hour)}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("application/x-tandem-task")) {
                      e.preventDefault();
                      setDragOverHour(hour);
                    }
                  }}
                  onDragLeave={() => setDragOverHour(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverHour(null);
                    const raw = e.dataTransfer.getData("application/x-tandem-task");
                    if (raw && onTaskDrop) {
                      try {
                        const taskData = JSON.parse(raw) as TaskDropData;
                        onTaskDrop(hour, taskData);
                      } catch {}
                    }
                  }}
                >
                  {isDragOver && (
                    <span className="text-[10px] text-primary/70 italic pl-2 pt-1 block">Drop to block</span>
                  )}
                </div>
              );
            })}

            {/* Positioned events */}
            {timedEvents.map((event) => {
              const isDraggingThis = isDragActive && dragRef.current?.eventId === event.id;
              let startMins = getMinutesSinceMidnight(event.startTime!);
              let endMins = event.endTime
                ? getMinutesSinceMidnight(event.endTime)
                : startMins + 60;

              // Handle cross-midnight events: if end < start, the event spans midnight.
              // On the start day: clamp end to midnight (24:00).
              // On the continuation day: clamp start to midnight (00:00).
              if (endMins < startMins) {
                const eventStartDate = new Date(event.startTime!).toDateString();
                const viewDate = date.toDateString();
                if (eventStartDate === viewDate) {
                  endMins = 24 * 60; // show until midnight
                } else {
                  startMins = 0; // show from midnight
                }
              }

              const durationMins = Math.max(endMins - startMins, SNAP_MINUTES);

              const topPx = isDraggingThis && dragPreview
                ? dragPreview.topPx
                : ((startMins / 60) - FIRST_HOUR) * HOUR_HEIGHT;
              const heightPx = isDraggingThis && dragPreview
                ? dragPreview.heightPx
                : (durationMins / 60) * HOUR_HEIGHT;

              const draggable = canDrag(event);

              return (
                <div
                  key={event.id}
                  className={cn(
                    "absolute left-1 right-1 z-10 flex flex-col",
                    isDraggingThis && "opacity-80 ring-2 ring-primary/50 rounded shadow-lg z-30",
                    draggable && "group"
                  )}
                  style={{ top: Math.max(topPx, 0), height: Math.max(heightPx, 16) }}
                >
                  {/* Move handle — full event body */}
                  <div
                    className={cn(
                      "flex-1 min-h-0 overflow-hidden",
                      draggable && "cursor-grab active:cursor-grabbing"
                    )}
                    onMouseDown={(e) => {
                      if (draggable) startDrag(e, event, "move");
                    }}
                  >
                    <CalendarEventCard
                      event={event}
                      compact={heightPx < 30}
                      onDoubleClick={() => onEventClick(event)}
                    />
                  </div>

                  {/* Resize handle — bottom edge */}
                  {draggable && heightPx >= 24 && (
                    <div
                      className="h-3 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, event, "resize");
                      }}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Drag preview time tooltip */}
            {isDragActive && dragPreview && (
              <div
                className="absolute left-14 z-40 bg-popover text-popover-foreground text-[10px] px-2 py-0.5 rounded shadow-md border pointer-events-none"
                style={{ top: dragPreview.topPx - 20 }}
              >
                {formatTimeShort(Math.round(pxToMinutes(dragPreview.topPx)))}
                {" – "}
                {formatTimeShort(Math.round(pxToMinutes(dragPreview.topPx + dragPreview.heightPx)))}
              </div>
            )}

            {/* Current time indicator */}
            {isToday && currentMinutes >= FIRST_HOUR * 60 && currentMinutes <= (LAST_HOUR + 1) * 60 && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: ((currentMinutes / 60) - FIRST_HOUR) * HOUR_HEIGHT }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 border-t border-red-500" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
