"use client";

import { useState } from "react";
import { RecurringCard } from "./RecurringCard";
import { TemplatePackSection } from "./TemplatePackCard";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Sun, CalendarDays, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardFileTask {
  id: string;
  title: string;
  notes?: string | null;
  scheduledDate?: string | null;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  version: number;
  context?: { id: string; name: string; color: string | null } | null;
  project?: { id: string; title: string } | null;
  recurringTemplate?: {
    id: string;
    color?: string | null;
    estimatedMins?: number | null;
    scheduleLabel: string;
    skipStreak?: number;
  } | null;
}

interface CardFileViewProps {
  overdue: CardFileTask[];
  today: CardFileTask[];
  upcoming: CardFileTask[];
  onComplete: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onDefer: (taskId: string, date: string) => void;
  onLoadPack?: () => void;
}

export function CardFileView({
  overdue,
  today,
  upcoming,
  onComplete,
  onSkip,
  onDefer,
  onLoadPack,
}: CardFileViewProps) {
  const [todayOpen, setTodayOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  const hasAny = overdue.length > 0 || today.length > 0 || upcoming.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
        <RotateCcw className="h-10 w-10 mb-4" />
        <p className="font-medium text-foreground">No recurring tasks scheduled</p>
        <p className="text-sm mt-1 max-w-sm">
          Load a template pack to get started with pre-built routines, or
          create templates in Settings &rarr; Recurring Templates.
        </p>
        {onLoadPack && (
          <div className="mt-6">
            <TemplatePackSection onLoaded={onLoadPack} />
          </div>
        )}
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
            {overdue.map((task) => (
              <RecurringCard
                key={task.id}
                task={task}
                onComplete={onComplete}
                onSkip={onSkip}
                onDefer={onDefer}
              />
            ))}
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
              {today.map((task) => (
                <RecurringCard
                  key={task.id}
                  task={task}
                  onComplete={onComplete}
                  onSkip={onSkip}
                  onDefer={onDefer}
                />
              ))}
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
              {upcoming.map((task) => (
                <RecurringCard
                  key={task.id}
                  task={task}
                  onComplete={onComplete}
                  onSkip={onSkip}
                  onDefer={onDefer}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
