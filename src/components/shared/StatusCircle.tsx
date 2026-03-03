"use client";

import { cn } from "@/lib/utils";

interface StatusCircleProps {
  status: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const ariaLabels: Record<string, string> = {
  // Task statuses
  NOT_STARTED: "Not started — click to start",
  IN_PROGRESS: "In progress — click to complete",
  COMPLETED: "Completed — click to reopen",
  // Project statuses
  ACTIVE: "Active project — click to complete",
  ON_HOLD: "On hold — click to complete",
  DROPPED: "Dropped project",
  SOMEDAY_MAYBE: "Someday/maybe project — click to complete",
};

export function StatusCircle({ status, onClick, disabled, className }: StatusCircleProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabels[status] || "Change status"}
      className={cn(
        "shrink-0 cursor-pointer transition-transform active:scale-90",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) onClick();
        }
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
      >
        {/* Invisible hit area so clicks in the center of empty circles register */}
        <circle cx="8" cy="8" r="8" fill="transparent" />

        {/* Task: NOT_STARTED — gray outlined circle */}
        {status === "NOT_STARTED" && (
          <circle
            cx="8"
            cy="8"
            r="7"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1.5"
            fill="none"
          />
        )}

        {/* Task: IN_PROGRESS — half-filled primary circle */}
        {status === "IN_PROGRESS" && (
          <>
            <circle
              cx="8"
              cy="8"
              r="7"
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M8 1 A7 7 0 0 0 8 15 Z"
              fill="hsl(var(--primary))"
            />
          </>
        )}

        {/* Shared: COMPLETED — filled circle with checkmark */}
        {status === "COMPLETED" && (
          <>
            <circle
              cx="8"
              cy="8"
              r="7.5"
              fill="hsl(var(--primary))"
            />
            <path
              d="M5 8.5 L7 10.5 L11 6"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}

        {/* Project: ACTIVE — green outlined circle */}
        {status === "ACTIVE" && (
          <circle
            cx="8"
            cy="8"
            r="7"
            stroke="#22c55e"
            strokeWidth="1.5"
            fill="none"
          />
        )}

        {/* Project: ON_HOLD — yellow half-filled circle */}
        {status === "ON_HOLD" && (
          <>
            <circle
              cx="8"
              cy="8"
              r="7"
              stroke="#eab308"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M8 1 A7 7 0 0 0 8 15 Z"
              fill="#eab308"
            />
          </>
        )}

        {/* Project: DROPPED — gray filled circle with X */}
        {status === "DROPPED" && (
          <>
            <circle
              cx="8"
              cy="8"
              r="7.5"
              fill="#9ca3af"
            />
            <path
              d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}

        {/* Project: SOMEDAY_MAYBE — purple outlined circle */}
        {status === "SOMEDAY_MAYBE" && (
          <circle
            cx="8"
            cy="8"
            r="7"
            stroke="#a855f7"
            strokeWidth="1.5"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}
