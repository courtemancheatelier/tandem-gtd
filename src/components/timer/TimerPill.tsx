"use client";

import { useTimer } from "@/contexts/TimerContext";
import { Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

function formatMin(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min} min`;
}

export function TimerPill() {
  const { session, elapsedMin, pause, resume, stop } = useTimer();

  if (!session) return null;

  const isPaused = !!session.pausedAt;

  return (
    <div className="fixed bottom-20 left-4 md:bottom-4 z-50 flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-md animate-in slide-in-from-bottom-2 fade-in duration-200">
      {isPaused ? (
        <span className="text-muted-foreground text-sm">⏸</span>
      ) : (
        <span className="text-primary text-sm animate-pulse">●</span>
      )}
      <span className="text-sm font-medium truncate max-w-[10rem]">
        {session.taskTitle}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatMin(elapsedMin)}
      </span>
      <div className="flex items-center gap-0.5 ml-1">
        {isPaused ? (
          <button
            onClick={resume}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded-full",
              "hover:bg-primary/10 text-primary transition-colors"
            )}
            title="Resume"
          >
            <Play className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={pause}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded-full",
              "hover:bg-muted text-muted-foreground transition-colors"
            )}
            title="Pause"
          >
            <Pause className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={() => stop()}
          className={cn(
            "h-6 w-6 flex items-center justify-center rounded-full",
            "hover:bg-muted text-muted-foreground transition-colors"
          )}
          title="Stop"
        >
          <Square className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
