"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export interface TimerSession {
  id: string;
  taskId: string;
  taskTitle: string;
  startedAt: string;
  pausedAt: string | null;
  durationMin: number;
  isRunaway?: boolean;
}

interface TimerContextValue {
  session: TimerSession | null;
  elapsedMin: number;
  isLoading: boolean;
  start: (taskId: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (opts?: {
    adjustedMinutes?: number;
    discard?: boolean;
  }) => Promise<{ totalTaskMinutes: number } | null>;
  showRunawayDialog: boolean;
  setShowRunawayDialog: (show: boolean) => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
}

function computeElapsed(session: TimerSession): number {
  if (session.pausedAt) {
    return session.durationMin;
  }
  const runningMs = Date.now() - new Date(session.startedAt).getTime();
  return session.durationMin + Math.floor(runningMs / 60000);
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TimerSession | null>(null);
  const [elapsedMin, setElapsedMin] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showRunawayDialog, setShowRunawayDialog] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update elapsed every 60 seconds when running
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (session && !session.pausedAt) {
      setElapsedMin(computeElapsed(session));
      intervalRef.current = setInterval(() => {
        setElapsedMin(computeElapsed(session));
      }, 60_000);
    } else if (session) {
      setElapsedMin(session.durationMin);
    } else {
      setElapsedMin(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [session]);

  // Fetch active session on mount
  useEffect(() => {
    async function fetchActive() {
      try {
        const res = await fetch("/api/timer/active");
        if (res.status === 204) {
          setSession(null);
        } else if (res.ok) {
          const data = await res.json();
          setSession({
            id: data.id,
            taskId: data.taskId,
            taskTitle: data.taskTitle,
            startedAt: data.startedAt,
            pausedAt: data.pausedAt,
            durationMin: data.durationMin,
            isRunaway: data.isRunaway,
          });
          if (data.isRunaway) {
            setShowRunawayDialog(true);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchActive();
  }, []);

  const start = useCallback(async (taskId: string) => {
    const res = await fetch("/api/timer/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    if (res.ok) {
      const data = await res.json();
      setSession({
        id: data.session.id,
        taskId: data.session.taskId,
        taskTitle: data.session.taskTitle,
        startedAt: data.session.startedAt,
        pausedAt: data.session.pausedAt,
        durationMin: data.session.durationMin,
      });
    }
  }, []);

  const pause = useCallback(async () => {
    const res = await fetch("/api/timer/pause", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSession({
        id: data.id,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        startedAt: data.startedAt,
        pausedAt: data.pausedAt,
        durationMin: data.durationMin,
      });
    }
  }, []);

  const resume = useCallback(async () => {
    const res = await fetch("/api/timer/resume", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSession({
        id: data.id,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        startedAt: data.startedAt,
        pausedAt: data.pausedAt,
        durationMin: data.durationMin,
      });
    }
  }, []);

  const stop = useCallback(
    async (
      opts?: { adjustedMinutes?: number; discard?: boolean }
    ): Promise<{ totalTaskMinutes: number } | null> => {
      const res = await fetch("/api/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts || {}),
      });
      if (res.ok) {
        const data = await res.json();
        setSession(null);
        if (data.totalTaskMinutes !== undefined) {
          return { totalTaskMinutes: data.totalTaskMinutes };
        }
      }
      setSession(null);
      return null;
    },
    []
  );

  return (
    <TimerContext.Provider
      value={{
        session,
        elapsedMin,
        isLoading,
        start,
        pause,
        resume,
        stop,
        showRunawayDialog,
        setShowRunawayDialog,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}
