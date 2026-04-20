"use client";

import { useState, useEffect } from "react";
import { useTimer } from "@/contexts/TimerContext";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Clock } from "lucide-react";

function formatMin(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min} min`;
}

interface TaskTimerSectionProps {
  taskId: string;
}

export function TaskTimerSection({ taskId }: TaskTimerSectionProps) {
  const { session, elapsedMin, start, pause, resume, stop } = useTimer();
  const [prevSessions, setPrevSessions] = useState<{
    totalMinutes: number;
    count: number;
  } | null>(null);

  const isThisTask = session?.taskId === taskId;
  const isRunning = isThisTask && !session?.pausedAt;
  const isPaused = isThisTask && !!session?.pausedAt;

  // Fetch previous sessions for this task
  useEffect(() => {
    async function fetchSessions() {
      const res = await fetch(`/api/tasks/${taskId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        // Exclude active session from count
        const completed = data.sessions.filter(
          (s: { isActive: boolean }) => !s.isActive
        );
        if (completed.length > 0) {
          const total = completed.reduce(
            (sum: number, s: { durationMin: number }) => sum + s.durationMin,
            0
          );
          setPrevSessions({ totalMinutes: total, count: completed.length });
        }
      }
    }
    fetchSessions();
  }, [taskId, session]); // Re-fetch when session changes (timer stopped)

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Timer
      </label>

      {/* Previous sessions summary */}
      {prevSessions && prevSessions.totalMinutes > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatMin(prevSessions.totalMinutes)} across{" "}
          {prevSessions.count} previous session
          {prevSessions.count !== 1 ? "s" : ""}
        </p>
      )}

      {isRunning && (
        <div className="flex items-center gap-2">
          <span className="text-primary animate-pulse text-sm">●</span>
          <span className="text-sm font-medium">{formatMin(elapsedMin)}</span>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={pause}
            >
              <Pause className="h-3 w-3 mr-1" />
              Pause
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => stop()}
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          </div>
        </div>
      )}

      {isPaused && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">⏸</span>
          <span className="text-sm font-medium">{formatMin(elapsedMin)}</span>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={resume}
            >
              <Play className="h-3 w-3 mr-1" />
              Resume
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => stop()}
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          </div>
        </div>
      )}

      {!isThisTask && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => start(taskId)}
          >
            <Play className="h-3 w-3 mr-1" />
            Start Timer
          </Button>
          {session && (
            <p className="text-xs text-muted-foreground mt-1">
              Will pause timer on &ldquo;{session.taskTitle}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
