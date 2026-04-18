"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

type CalendarView = "day" | "week" | "month";

interface CalendarSidebarContextValue {
  isOpen: boolean;
  view: CalendarView;
  selectedDate: Date;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setView: (view: CalendarView) => void;
  setSelectedDate: (date: Date) => void;
  registerRefresh: (fn: () => Promise<void>) => void;
  refreshEvents: () => void;
  openForDrop: () => void;
}

const CalendarSidebarContext = createContext<CalendarSidebarContextValue | null>(null);

const OPEN_KEY = "calendar-sidebar-open";
const VIEW_KEY = "calendar-sidebar-view";

export function CalendarSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setViewState] = useState<CalendarView>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsOpen(localStorage.getItem(OPEN_KEY) === "true");
    const savedView = localStorage.getItem(VIEW_KEY);
    if (savedView === "day" || savedView === "week" || savedView === "month") {
      setViewState(savedView);
    }
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(OPEN_KEY, String(next));
      return next;
    });
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    localStorage.setItem(OPEN_KEY, String(open));
  }, []);

  const setView = useCallback((v: CalendarView) => {
    setViewState(v);
    localStorage.setItem(VIEW_KEY, v);
  }, []);

  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const registerRefresh = useCallback((fn: () => Promise<void>) => {
    refreshRef.current = fn;
  }, []);

  const refreshEvents = useCallback(() => {
    refreshRef.current?.();
  }, []);

  const openForDrop = useCallback(() => {
    setIsOpen(true);
    localStorage.setItem(OPEN_KEY, "true");
    setViewState("day");
    localStorage.setItem(VIEW_KEY, "day");
  }, []);

  return (
    <CalendarSidebarContext.Provider
      value={{
        isOpen: mounted ? isOpen : false,
        view: mounted ? view : "day",
        selectedDate,
        toggle,
        setOpen,
        setView,
        setSelectedDate,
        registerRefresh,
        refreshEvents,
        openForDrop,
      }}
    >
      {children}
    </CalendarSidebarContext.Provider>
  );
}

export function useCalendarSidebar() {
  const ctx = useContext(CalendarSidebarContext);
  if (!ctx) throw new Error("useCalendarSidebar must be used within CalendarSidebarProvider");
  return ctx;
}
