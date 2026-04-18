"use client";

import { useEffect, useState, useRef } from "react";
import { useUndo } from "@/contexts/UndoContext";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DURATION_MS = 5000;
const TICK_MS = 50;

export function UndoToast() {
  const { current, execute, dismiss, pause, resume } = useUndo();
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const [executing, setExecuting] = useState(false);
  const startRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const elapsedBeforePauseRef = useRef(0);

  // Slide in/out animation
  useEffect(() => {
    if (current) {
      // Small delay so the CSS transition triggers
      requestAnimationFrame(() => setVisible(true));
      startRef.current = Date.now();
      elapsedBeforePauseRef.current = 0;
      pausedRef.current = false;
      setProgress(100);
      setExecuting(false);
    } else {
      setVisible(false);
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown progress bar
  useEffect(() => {
    if (!current) return;

    const interval = setInterval(() => {
      if (pausedRef.current) return;
      const elapsed =
        elapsedBeforePauseRef.current + (Date.now() - startRef.current);
      const remaining = Math.max(0, DURATION_MS - elapsed);
      setProgress((remaining / DURATION_MS) * 100);
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMouseEnter() {
    pausedRef.current = true;
    elapsedBeforePauseRef.current += Date.now() - startRef.current;
    pause();
  }

  function handleMouseLeave() {
    pausedRef.current = false;
    startRef.current = Date.now();
    resume();
  }

  async function handleUndo() {
    setExecuting(true);
    await execute();
  }

  if (!current) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[100]",
        "transition-all duration-300 ease-out",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative overflow-hidden rounded-lg border bg-background shadow-lg min-w-[300px] max-w-[420px]">
        {/* Content */}
        <div className="flex items-center gap-3 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-sm flex-1 truncate">
            {current.description}
          </span>
          <button
            onClick={handleUndo}
            disabled={executing}
            className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50 shrink-0"
          >
            {executing ? "Undoing..." : "Undo"}
          </button>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Countdown progress bar */}
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] ease-linear"
            style={{
              width: `${progress}%`,
              transitionDuration: `${TICK_MS}ms`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
