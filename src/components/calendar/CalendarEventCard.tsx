"use client";

import { cn } from "@/lib/utils";
import { ExternalLink, Zap } from "lucide-react";

interface CalendarEventCardProps {
  event: {
    id: string;
    title: string;
    eventType: string;
    startTime?: string | null;
    endTime?: string | null;
    color?: string | null;
    syncStatus?: string;
    googleEventId?: string | null;
    googleCalendarId?: string | null;
    task?: { id: string; title: string } | null;
    project?: { id: string; title: string } | null;
  };
  onClick?: () => void;
  onDoubleClick?: () => void;
  compact?: boolean;
}

const typeColors: Record<string, string> = {
  TIME_SPECIFIC: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
  TIME_BLOCK: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400",
  DAY_SPECIFIC: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  INFORMATION: "bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400",
  EXTERNAL: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400",
  TASK_DEADLINE: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getGoogleCalendarUrl(googleEventId: string, googleCalendarId: string): string {
  // Google Calendar event URL uses base64-encoded "eventId calendarId"
  const raw = `${googleEventId} ${googleCalendarId}`;
  const eid = btoa(raw).replace(/=+$/, "");
  return `https://calendar.google.com/calendar/event?eid=${eid}`;
}

export function CalendarEventCard({ event, onClick, onDoubleClick, compact }: CalendarEventCardProps) {
  const isExternal = event.syncStatus === "EXTERNAL";
  const isTaskDeadline = event.syncStatus === "TASK_DEADLINE";
  const hasGoogleLink = isExternal && event.googleEventId && event.googleCalendarId;
  const hasLinkedTask = !isExternal && !isTaskDeadline && !!event.task?.id;

  // Use Google Calendar color for external events when available
  const hasCustomColor = isExternal && event.color;
  const colorClass = hasCustomColor
    ? "hover:opacity-80"
    : isTaskDeadline
      ? typeColors.TASK_DEADLINE
      : isExternal
        ? typeColors.EXTERNAL
        : (typeColors[event.eventType] || typeColors.TIME_SPECIFIC);
  const customStyle = hasCustomColor
    ? {
        backgroundColor: `${event.color}18`,
        color: event.color!,
        borderColor: `${event.color}50`,
      }
    : undefined;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (hasGoogleLink) {
          window.open(
            getGoogleCalendarUrl(event.googleEventId!, event.googleCalendarId!),
            "_blank",
            "noopener,noreferrer"
          );
        } else if (isTaskDeadline && event.task?.id) {
          if (event.project?.id) {
            window.location.href = `/projects/${event.project.id}`;
          } else {
            window.location.href = `/do-now`;
          }
        } else {
          onClick?.();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!hasGoogleLink && !isTaskDeadline) {
          onDoubleClick?.();
        }
      }}
      style={customStyle}
      className={cn(
        "w-full h-full text-left rounded border text-xs transition-colors hover:opacity-80 overflow-hidden",
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
        colorClass,
        compact && "truncate",
        (hasGoogleLink || isTaskDeadline) && "cursor-pointer"
      )}
      title={isTaskDeadline ? (event.project ? `Task due date — click to open project` : "Task due date — click to view in Do Now") : isExternal ? "Open in Google Calendar" : undefined}
    >
      <span className="font-medium truncate flex items-center gap-1">
        {isExternal && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />}
        <span className="truncate">{event.title}</span>
        {hasLinkedTask && (
          <span
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            title="Go to task"
            onClick={(e) => {
              e.stopPropagation();
              if (event.project?.id) {
                window.location.href = `/projects/${event.project.id}`;
              } else {
                window.location.href = `/do-now`;
              }
            }}
          >
            <Zap className="h-3 w-3" />
          </span>
        )}
      </span>
      {!compact && event.startTime && (
        <span className="text-[10px] opacity-70">
          {formatTime(event.startTime)}
          {event.endTime && ` – ${formatTime(event.endTime)}`}
        </span>
      )}
    </button>
  );
}
