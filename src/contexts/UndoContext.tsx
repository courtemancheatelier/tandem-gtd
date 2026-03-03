"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

export interface UndoOperation {
  id: string;
  description: string;
  reverseAction: () => Promise<void>;
  expiresAt: number;
}

interface UndoContextValue {
  current: UndoOperation | null;
  push: (op: Omit<UndoOperation, "id" | "expiresAt">) => void;
  execute: () => Promise<void>;
  dismiss: () => void;
  pause: () => void;
  resume: () => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

const UNDO_DURATION_MS = 5000;

let undoCounter = 0;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<UndoOperation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setCurrent(null);
    remainingRef.current = 0;
    pausedAtRef.current = null;
  }, [clearTimer]);

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer();
      remainingRef.current = ms;
      timerRef.current = setTimeout(() => {
        setCurrent(null);
        remainingRef.current = 0;
        pausedAtRef.current = null;
      }, ms);
    },
    [clearTimer]
  );

  const push = useCallback(
    (op: Omit<UndoOperation, "id" | "expiresAt">) => {
      clearTimer();
      const id = String(++undoCounter);
      const expiresAt = Date.now() + UNDO_DURATION_MS;
      setCurrent({ ...op, id, expiresAt });
      pausedAtRef.current = null;
      startTimer(UNDO_DURATION_MS);
    },
    [clearTimer, startTimer]
  );

  const execute = useCallback(async () => {
    const op = current;
    if (!op) return;
    dismiss();
    await op.reverseAction();
  }, [current, dismiss]);

  const pause = useCallback(() => {
    if (!current || pausedAtRef.current !== null) return;
    clearTimer();
    const elapsed = Date.now() - (current.expiresAt - UNDO_DURATION_MS);
    remainingRef.current = Math.max(0, UNDO_DURATION_MS - elapsed);
    pausedAtRef.current = Date.now();
  }, [current, clearTimer]);

  const resume = useCallback(() => {
    if (!current || pausedAtRef.current === null) return;
    pausedAtRef.current = null;
    if (remainingRef.current > 0) {
      startTimer(remainingRef.current);
    } else {
      dismiss();
    }
  }, [current, startTimer, dismiss]);

  // Cmd+Z / Ctrl+Z keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!current) return;
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const isUndo =
        (isMac && e.metaKey && !e.shiftKey && e.key === "z") ||
        (!isMac && e.ctrlKey && !e.shiftKey && e.key === "z");
      if (isUndo) {
        e.preventDefault();
        execute();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, execute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return (
    <UndoContext.Provider
      value={{ current, push, execute, dismiss, pause, resume }}
    >
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}
