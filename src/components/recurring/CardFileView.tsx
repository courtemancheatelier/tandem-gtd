"use client";

import { useState } from "react";
import { RecurringCard } from "./RecurringCard";
import { RoutineCard, type RoutineCardTask } from "./RoutineCard";
import { SleepCard, type SleepCardTask } from "./SleepCard";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Sun, CalendarDays, RotateCcw, ChevronDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export interface CardFileTask {
  id: string;
  title: string;
  notes?: string | null;
  scheduledDate?: string | null;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  version: number;
  context?: { id: string; name: string; color: string | null } | null;
  project?: { id: string; title: string } | null;
  isOverdueWithinDay?: boolean;
  routine?: {
    id: string;
    color?: string | null;
    estimatedMins?: number | null;
    scheduleLabel: string;
    routineType?: string;
    dayNumber?: number | null;
    totalDays?: number | null;
    skipStreak?: number;
    targetTime?: string | null;
    dueByTime?: string | null;
    progression?: {
      currentValue: number;
      unit: string;
      label: string;
    } | null;
    targetBedtime?: string | null;
    targetWakeTime?: string | null;
    sleepLog?: {
      id: string;
      bedtime?: string | null;
      wakeTime?: string | null;
      durationMins?: number | null;
      bedtimeOnTime?: boolean | null;
      wakeOnTime?: boolean | null;
      targetBedtime?: string | null;
      targetWakeTime?: string | null;
    } | null;
    windows: {
      id: string;
      title: string;
      targetTime?: string | null;
      sortOrder: number;
      constraint?: string | null;
      windowType?: string;
      items: { id: string; name: string; dosage?: string | null; form?: string | null; notes?: string | null; dosageChanged?: boolean }[];
      log?: { id: string; status: string; reason?: string | null; itemsTaken?: string[] | null } | null;
    }[];
  } | null;
}

interface CardFileViewProps {
  overdue: CardFileTask[];
  today: CardFileTask[];
  upcoming: CardFileTask[];
  onComplete: (taskId: string, note?: string) => void;
  onSkip: (taskId: string, note?: string) => void;
  onDefer: (taskId: string, date: string) => void;
  onMoveToToday?: (taskId: string) => void;
  onCheckWindow?: (routineId: string, windowId: string, date: string, status: "completed" | "skipped") => Promise<void>;
  onToggleItem?: (routineId: string, windowId: string, date: string, itemId: string, taken: boolean) => Promise<void>;
  onLogSleep?: (routineId: string, date: string, action: "bed" | "wake") => Promise<void>;
  onEditSleep?: (routineId: string, date: string, bedtime: string, wakeTime: string) => Promise<void>;
}

function renderCard(
  task: CardFileTask,
  handlers: {
    onComplete: (taskId: string, note?: string) => void;
    onSkip: (taskId: string, note?: string) => void;
    onDefer: (taskId: string, date: string) => void;
    onMoveToToday?: (taskId: string) => void;
    onCheckWindow?: (routineId: string, windowId: string, date: string, status: "completed" | "skipped") => Promise<void>;
    onToggleItem?: (routineId: string, windowId: string, date: string, itemId: string, taken: boolean) => Promise<void>;
    onLogSleep?: (routineId: string, date: string, action: "bed" | "wake") => Promise<void>;
    onEditSleep?: (routineId: string, date: string, bedtime: string, wakeTime: string) => Promise<void>;
  },
  readonly?: boolean
) {
  // Sleep tracker routines use SleepCard
  if (task.routine?.routineType === "sleep") {
    return (
      <SleepCard
        key={task.id}
        task={task as unknown as SleepCardTask}
        onLogSleep={handlers.onLogSleep}
        onEditSleep={handlers.onEditSleep}
        onMoveToToday={handlers.onMoveToToday}
        readonly={readonly}
      />
    );
  }
  // Windowed routines use RoutineCard, simple routines use RecurringCard
  if (task.routine && task.routine.windows.length > 0) {
    return (
      <RoutineCard
        key={task.id}
        task={task as unknown as RoutineCardTask}
        onCheckWindow={handlers.onCheckWindow ?? (async () => {})}
        onToggleItem={handlers.onToggleItem}
        onMoveToToday={handlers.onMoveToToday}
        readonly={readonly}
      />
    );
  }
  return (
    <RecurringCard
      key={task.id}
      task={task}
      onComplete={handlers.onComplete}
      onSkip={handlers.onSkip}
      onDefer={handlers.onDefer}
      onMoveToToday={handlers.onMoveToToday}
      readonly={readonly}
    />
  );
}

export function CardFileView({
  overdue,
  today,
  upcoming,
  onComplete,
  onSkip,
  onDefer,
  onMoveToToday,
  onCheckWindow,
  onToggleItem,
  onLogSleep,
  onEditSleep,
}: CardFileViewProps) {
  const [todayOpen, setTodayOpen] = useState(true);
  // Auto-expand upcoming when there are no overdue or today cards
  const [upcomingOpen, setUpcomingOpen] = useState(overdue.length === 0 && today.length === 0);

  const hasAny = overdue.length > 0 || today.length > 0 || upcoming.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
        <RotateCcw className="h-10 w-10 mb-4" />
        <p className="font-medium text-foreground">No recurring cards yet</p>
        <p className="text-sm mt-1 max-w-sm">
          Recurring cards are managed in Settings. Create routines there to
          add cards to your daily routine. You can also pause or delete them
          from the same page.
        </p>
        <Link
          href="/settings/routines"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Go to Routines
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">Overdue</h2>
            <Badge variant="destructive" className="text-[10px]">
              {overdue.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {overdue.map((task) => renderCard(task, { onComplete, onSkip, onDefer, onCheckWindow, onToggleItem, onLogSleep, onEditSleep }))}
          </div>
        </section>
      )}

      {today.length > 0 && (
        <section>
          <button
            className="flex items-center gap-2 mb-3 w-full text-left"
            onClick={() => setTodayOpen(!todayOpen)}
          >
            <Sun className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Today&apos;s Cards</h2>
            <Badge variant="secondary" className="text-[10px]">
              {today.length}
            </Badge>
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", !todayOpen && "-rotate-90")} />
          </button>
          {todayOpen && (
            <div className="space-y-2">
              {today.map((task) => renderCard(task, { onComplete, onSkip, onDefer, onCheckWindow, onToggleItem, onLogSleep, onEditSleep }))}
            </div>
          )}
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <button
            className="flex items-center gap-2 mb-3 w-full text-left"
            onClick={() => setUpcomingOpen(!upcomingOpen)}
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">Upcoming</h2>
            <Badge variant="outline" className="text-[10px]">
              {upcoming.length}
            </Badge>
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", !upcomingOpen && "-rotate-90")} />
          </button>
          {upcomingOpen && (
            <div className="space-y-2">
              {upcoming.map((task) => renderCard(task, { onComplete, onSkip, onDefer, onMoveToToday, onCheckWindow, onLogSleep, onEditSleep }, true))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
