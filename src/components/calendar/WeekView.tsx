"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CalendarEventCard } from "./CalendarEventCard";
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

interface WeekViewProps {
  startOfWeek: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick?: (hour: number, date: Date) => void;
  onTaskDrop?: (date: Date, taskData: TaskDropData) => void;
  onEventTimeChange?: (eventId: string, date: Date, startTime: string, endTime: string) => void;
}

const FIRST_HOUR = 0;
const LAST_HOUR = 23;
const TOTAL_HOURS = LAST_HOUR - FIRST_HOUR + 1;
const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 15;
const SNAP_PX = (SNAP_MINUTES / 60) * HOUR_HEIGHT;
const DRAG_THRESHOLD = 4;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i + FIRST_HOUR);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDays(start: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

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
  dayIndex: number;
  currentDayIndex: number;
  activated: boolean;
}

export function WeekView({ startOfWeek, events, onDayClick, onEventClick, onSlotClick, onTaskDrop, onEventTimeChange }: WeekViewProps) {
  const days = getWeekDays(startOfWeek);
  const today = new Date();
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dragPreview, setDragPreview] = useState<{ topPx: number; heightPx: number; dayIndex: number } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function getDayEvents(day: Date) {
    return events.filter((e) => {
      // Event starts on this day
      if (isSameDay(new Date(e.date), day)) return true;
      // Cross-midnight: event started yesterday but endTime extends into this day
      if (e.startTime && e.endTime) {
        const startDate = new Date(e.startTime);
        const endDate = new Date(e.endTime);
        if (endDate > startDate) {
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(day);
          dayEnd.setHours(23, 59, 59, 999);
          // Event's end time falls within or after this day's start, AND event started before this day
          if (startDate < dayStart && endDate > dayStart) return true;
        }
      }
      return false;
    });
  }

  function getAllDayEvents(day: Date) {
    return getDayEvents(day).filter(
      (e) => e.allDay || e.eventType === "DAY_SPECIFIC" || e.eventType === "INFORMATION"
      || e.syncStatus === "TASK_DEADLINE"
    );
  }

  function getTimedEvents(day: Date) {
    return getDayEvents(day).filter(
      (e) => !e.allDay && e.syncStatus !== "TASK_DEADLINE"
      && (e.eventType === "TIME_SPECIFIC" || e.eventType === "TIME_BLOCK") && e.startTime
    );
  }

  const hasAnyAllDay = days.some((d) => getAllDayEvents(d).length > 0);

  const canDrag = useCallback((event: CalendarEvent) => {
    return event.syncStatus !== "EXTERNAL" && event.syncStatus !== "TASK_DEADLINE" && !!onEventTimeChange;
  }, [onEventTimeChange]);

  // Document-level mouse events for drag
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaY = e.clientY - drag.startY;

      if (!drag.activated) {
        if (Math.abs(deltaY) < DRAG_THRESHOLD) return;
        drag.activated = true;
        setIsDragActive(true);
      }

      e.preventDefault();
      const totalGridHeight = TOTAL_HOURS * HOUR_HEIGHT;

      // Determine which day column the mouse is over
      if (drag.mode === "move" && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const labelColWidth = gridRef.current.firstElementChild?.getBoundingClientRect().width || 48;
        const dayAreaLeft = gridRect.left + labelColWidth;
        const dayAreaWidth = gridRect.width - labelColWidth;
        const dayColWidth = dayAreaWidth / 7;
        const relX = e.clientX - dayAreaLeft;
        const newDayIndex = Math.max(0, Math.min(6, Math.floor(relX / dayColWidth)));
        drag.currentDayIndex = newDayIndex;
      }

      if (drag.mode === "move") {
        const newTop = snapToGrid(drag.origTopPx + deltaY);
        const clampedTop = Math.max(0, Math.min(totalGridHeight - drag.origHeightPx, newTop));
        setDragPreview({ topPx: clampedTop, heightPx: drag.origHeightPx, dayIndex: drag.currentDayIndex });
      } else {
        const newHeight = snapToGrid(drag.origHeightPx + deltaY);
        const minHeight = SNAP_PX;
        const maxHeight = totalGridHeight - drag.origTopPx;
        const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
        setDragPreview({ topPx: drag.origTopPx, heightPx: clampedHeight, dayIndex: drag.dayIndex });
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

      if (onEventTimeChange) {
        const day = days[drag.currentDayIndex];
        onEventTimeChange(drag.eventId, day, minutesToTimeStr(startMins), minutesToTimeStr(endMins));
      }

      setDragPreview(null);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [days, onEventTimeChange]);

  function startDrag(e: React.MouseEvent, event: CalendarEvent, mode: "move" | "resize", dayIndex: number) {
    if (!canDrag(event)) return;
    e.preventDefault();
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
      dayIndex,
      currentDayIndex: dayIndex,
      activated: false,
    };
    setDragPreview({ topPx, heightPx, dayIndex });
  }

  const currentMinutes = today.getHours() * 60 + today.getMinutes();

  return (
    <div className="flex flex-col h-full select-none">
      {/* Scrollable container for everything — fixes alignment */}
      <div className="flex-1 overflow-y-auto">
        {/* Header row — sticky */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b sticky top-0 bg-card z-20">
          <div className="border-r" />
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className="text-center py-2 border-r last:border-r-0 cursor-pointer hover:bg-accent/30"
                onClick={() => onDayClick(day)}
              >
                <p className="text-[10px] text-muted-foreground">{DAY_NAMES[day.getDay()]}</p>
                <p
                  className={cn(
                    "text-sm font-medium",
                    isToday && "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto"
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* All-day row — sticky below header */}
        {hasAnyAllDay && (
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b sticky top-[52px] bg-card z-20">
            <div className="border-r text-[10px] text-muted-foreground text-right pr-1 pt-1">All day</div>
            {days.map((day) => {
              const adEvents = getAllDayEvents(day);
              return (
                <div key={day.toISOString()} className="border-r last:border-r-0 p-0.5 min-h-[1.25rem] space-y-px">
                  {adEvents.map((event) => (
                    <div key={event.id} className="h-[18px]">
                      <CalendarEventCard
                        event={event}
                        onDoubleClick={() => onEventClick(event)}
                        compact
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid — absolute positioned events */}
        <div ref={gridRef} className="grid grid-cols-[3rem_repeat(7,1fr)]">
          {/* Hour labels */}
          <div className="relative border-r" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-[10px] text-muted-foreground text-right pr-1"
                style={{ top: (hour - FIRST_HOUR) * HOUR_HEIGHT }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const timedEvents = getTimedEvents(day);
            const isToday = isSameDay(day, today);

            return (
              <div
                key={day.toISOString()}
                className="relative border-r last:border-r-0"
                style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
              >
                {/* Hour grid lines + click targets */}
                {HOURS.map((hour) => {
                  const cellKey = `${day.toISOString()}-${hour}`;
                  const isDragOver = dragOverCell === cellKey;
                  const isCurrentHour = isToday && today.getHours() === hour;

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
                      onClick={() => !isDragActive && onSlotClick?.(hour, day)}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes("application/x-tandem-task")) {
                          e.preventDefault();
                          setDragOverCell(cellKey);
                        }
                      }}
                      onDragLeave={() => setDragOverCell(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverCell(null);
                        const raw = e.dataTransfer.getData("application/x-tandem-task");
                        if (raw && onTaskDrop) {
                          try {
                            const taskData = JSON.parse(raw) as TaskDropData;
                            onTaskDrop(day, taskData);
                          } catch {}
                        }
                      }}
                    />
                  );
                })}

                {/* Positioned events */}
                {timedEvents.map((event) => {
                  const isDraggingThis = isDragActive && dragRef.current?.eventId === event.id;
                  const isDraggedToOtherDay = isDraggingThis && dragPreview && dragPreview.dayIndex !== dayIndex;
                  const isDraggedHere = isDragActive && dragPreview && dragPreview.dayIndex === dayIndex && dragRef.current?.eventId === event.id && dragRef.current?.dayIndex !== dayIndex;

                  // Hide event from original column if dragged to another day
                  if (isDraggedToOtherDay) return null;

                  let startMins = getMinutesSinceMidnight(event.startTime!);
                  let endMins = event.endTime
                    ? getMinutesSinceMidnight(event.endTime)
                    : startMins + 60;

                  // Handle cross-midnight events
                  if (endMins < startMins) {
                    const eventStartDate = new Date(event.startTime!).toDateString();
                    const dayDate = day.toDateString();
                    if (eventStartDate === dayDate) {
                      endMins = 24 * 60;
                    } else {
                      startMins = 0;
                    }
                  }

                  const durationMins = Math.max(endMins - startMins, SNAP_MINUTES);

                  const topPx = (isDraggingThis || isDraggedHere) && dragPreview
                    ? dragPreview.topPx
                    : ((startMins / 60) - FIRST_HOUR) * HOUR_HEIGHT;
                  const heightPx = (isDraggingThis || isDraggedHere) && dragPreview
                    ? dragPreview.heightPx
                    : (durationMins / 60) * HOUR_HEIGHT;

                  const draggable = canDrag(event);

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "absolute left-0.5 right-0.5 z-10 flex flex-col",
                        isDraggingThis && "opacity-80 ring-2 ring-primary/50 rounded shadow-lg z-30",
                        draggable && "group"
                      )}
                      style={{ top: Math.max(topPx, 0), height: Math.max(heightPx, 14) }}
                    >
                      {/* Move handle */}
                      <div
                        className={cn(
                          "flex-1 min-h-0 overflow-hidden",
                          draggable && "cursor-grab active:cursor-grabbing"
                        )}
                        onMouseDown={(e) => {
                          if (draggable) startDrag(e, event, "move", dayIndex);
                        }}
                      >
                        <CalendarEventCard
                          event={event}
                          compact={heightPx < 28}
                          onDoubleClick={() => onEventClick(event)}
                        />
                      </div>

                      {/* Resize handle */}
                      {draggable && heightPx >= 24 && (
                        <div
                          className="h-2 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            startDrag(e, event, "resize", dayIndex);
                          }}
                        >
                          <GripVertical className="h-2 w-2 text-muted-foreground rotate-90" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Drag preview ghost (when dragged from another day) */}
                {isDragActive && dragPreview && dragPreview.dayIndex === dayIndex && dragRef.current && dragRef.current.dayIndex !== dayIndex && (
                  <div
                    className="absolute left-0.5 right-0.5 z-30 opacity-60 rounded border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
                    style={{ top: Math.max(dragPreview.topPx, 0), height: Math.max(dragPreview.heightPx, 14) }}
                  />
                )}

                {/* Drag preview tooltip */}
                {isDragActive && dragPreview && dragPreview.dayIndex === dayIndex && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 z-40 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow-md border pointer-events-none whitespace-nowrap"
                    style={{ top: dragPreview.topPx - 18 }}
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
