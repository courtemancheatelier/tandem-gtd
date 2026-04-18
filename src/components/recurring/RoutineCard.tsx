"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Clock, ChevronDown, ChevronUp, SkipForward, ArrowUp } from "lucide-react";
import { DeferPopover } from "./DeferPopover";
import { SkipPopover } from "./SkipPopover";
import { cn } from "@/lib/utils";

interface RoutineWindowItem {
  id: string;
  name: string;
  dosage?: string | null;
  form?: string | null;
  notes?: string | null;
  dosageChanged?: boolean;
}

interface RoutineWindowLog {
  id: string;
  status: string;
  reason?: string | null;
  itemsTaken?: string[] | null;
}

interface RoutineWindow {
  id: string;
  title: string;
  targetTime?: string | null;
  sortOrder: number;
  constraint?: string | null;
  windowType?: string | null;
  items: RoutineWindowItem[];
  log?: RoutineWindowLog | null;
}

export interface RoutineCardTask {
  id: string;
  title: string;
  scheduledDate?: string | null;
  estimatedMins?: number | null;
  version: number;
  routine: {
    id: string;
    color?: string | null;
    estimatedMins?: number | null;
    scheduleLabel: string;
    routineType?: string;
    dayNumber?: number | null;
    totalDays?: number | null;
    windows: RoutineWindow[];
  };
}

interface RoutineCardProps {
  task: RoutineCardTask;
  onCheckWindow: (routineId: string, windowId: string, date: string, status: "completed" | "skipped") => Promise<void>;
  onToggleItem?: (routineId: string, windowId: string, date: string, itemId: string, taken: boolean) => Promise<void>;
  onComplete?: (taskId: string) => void;
  onSkip?: (taskId: string, note?: string) => void;
  onDefer?: (taskId: string, date: string) => void;
  onMoveToToday?: (taskId: string) => void;
  readonly?: boolean;
}

function isItemTaken(window: RoutineWindow, itemId: string): boolean {
  if (!window.log) return false;
  if (window.log.status === "completed") return true;
  if (window.log.status === "skipped") return true;
  if (window.log.status === "partial" && window.log.itemsTaken) {
    return (window.log.itemsTaken as string[]).includes(itemId);
  }
  return false;
}

export function RoutineCard({
  task,
  onCheckWindow,
  onToggleItem,
  onComplete,
  onSkip,
  onDefer,
  onMoveToToday,
  readonly,
}: RoutineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const routine = task.routine;
  const color = routine.color ?? "#6366F1";
  const today = task.scheduledDate
    ? task.scheduledDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const totalWindows = routine.windows.length;
  const completedWindows = routine.windows.filter(
    (w) => w.log?.status === "completed" || w.log?.status === "skipped"
  ).length;
  const allDone = completedWindows === totalWindows;

  async function handleCheck(windowId: string, status: "completed" | "skipped") {
    setLoading(windowId);
    try {
      await onCheckWindow(routine.id, windowId, today, status);
    } finally {
      setLoading(null);
    }
  }

  async function handleToggleItem(windowId: string, itemId: string, taken: boolean) {
    if (!onToggleItem) return;
    setLoading(`${windowId}:${itemId}`);
    try {
      await onToggleItem(routine.id, windowId, today, itemId, taken);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border transition-all bg-card",
        allDone && "opacity-60"
      )}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      {/* Compact header row — matches TaskCard height */}
      <div
        className="flex items-center gap-3 px-3 py-[0.3rem] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium text-sm truncate min-w-0 flex-1">
          {task.title}
        </span>

        {/* Inline metadata — desktop */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {routine.dayNumber != null && routine.totalDays && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-600">
              Day {routine.dayNumber}/{routine.totalDays}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {routine.scheduleLabel}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              allDone
                ? "border-green-500 text-green-600"
                : "border-muted-foreground"
            )}
          >
            {completedWindows}/{totalWindows}
          </Badge>
          {routine.estimatedMins && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {routine.estimatedMins}m
            </span>
          )}
        </div>

        {/* Mobile metadata */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              allDone
                ? "border-green-500 text-green-600"
                : "border-muted-foreground"
            )}
          >
            {completedWindows}/{totalWindows}
          </Badge>
        </div>

        {/* Card-level actions: complete, defer, skip */}
        {!readonly && (onComplete || onSkip || onDefer) && (
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {onComplete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => onComplete(task.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Complete &mdash; done, schedule next</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {onDefer && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <DeferPopover onDefer={(date) => onDefer(task.id, date)} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Defer &mdash; push to a later date</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {onSkip && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <SkipPopover
                        skipStreak={0}
                        onSkip={(note) => onSkip(task.id, note)}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Skip &mdash; skip this one, schedule next</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}

        {/* Move to today (upcoming cards) */}
        {readonly && onMoveToToday && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToToday(task.id);
                  }}
                >
                  <ArrowUp className="h-3 w-3 mr-1" />
                  Today
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Move to today&apos;s cards</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Expand chevron */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* Expanded windows section */}
      {expanded && (
        <div className="border-t px-3 py-3 space-y-2">
          {/* Mobile schedule info */}
          <div className="flex md:hidden items-center gap-1.5 flex-wrap">
            {routine.dayNumber != null && routine.totalDays && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-600">
                Day {routine.dayNumber}/{routine.totalDays}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {routine.scheduleLabel}
            </Badge>
            {routine.estimatedMins && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {routine.estimatedMins}m
              </span>
            )}
          </div>

          {routine.windows.map((window) => {
            const isDone = window.log?.status === "completed";
            const isSkipped = window.log?.status === "skipped";
            const isPartial = window.log?.status === "partial";
            const isChecked = isDone || isSkipped;
            const isLoading = loading === window.id;

            return (
              <div
                key={window.id}
                className={cn(
                  "rounded-md border px-3 py-2 transition-colors",
                  isChecked
                    ? "bg-muted/50 border-muted"
                    : isPartial
                      ? "bg-muted/25 border-amber-200 dark:border-amber-900"
                      : "bg-background border-border"
                )}
              >
                {/* Window header */}
                <div className="flex items-center gap-2">
                  {!readonly && (
                    <Checkbox
                      checked={isChecked}
                      disabled={isLoading}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          handleCheck(window.id, "completed");
                        }
                      }}
                    />
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium flex-1",
                      isChecked && "line-through text-muted-foreground"
                    )}
                  >
                    {window.targetTime && (
                      <span className="text-muted-foreground mr-1.5">
                        {window.targetTime}
                      </span>
                    )}
                    {window.title}
                  </span>
                  {isSkipped && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-400">
                      skipped
                    </Badge>
                  )}
                  {isPartial && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-400">
                      partial
                    </Badge>
                  )}
                  {!readonly && !isChecked && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={isLoading}
                            onClick={() => handleCheck(window.id, "skipped")}
                          >
                            <SkipForward className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Skip window</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                {/* Items list */}
                <div className="ml-6 mt-1 space-y-0.5">
                  {window.items.map((item) => {
                    const itemTaken = isItemTaken(window, item.id);
                    const itemLoading = loading === `${window.id}:${item.id}`;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "text-xs flex items-center gap-1.5",
                          isChecked || itemTaken
                            ? "text-muted-foreground"
                            : "text-foreground"
                        )}
                      >
                        {!readonly && !isChecked && onToggleItem && (
                          <Checkbox
                            checked={itemTaken}
                            disabled={itemLoading}
                            className="h-3 w-3"
                            onCheckedChange={(checked) => {
                              handleToggleItem(window.id, item.id, !!checked);
                            }}
                          />
                        )}
                        <span className={cn(itemTaken && !isChecked && "line-through")}>
                          {item.name}
                        </span>
                        {item.dosage && window.windowType === "health" && (
                          <span className="text-muted-foreground">
                            — {item.dosage}
                            {item.dosageChanged && (
                              <span className="text-amber-500 ml-1 font-medium" title="Dosage changed from yesterday">
                                (changed)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Complete all button */}
          {!readonly && !allDone && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  const unchecked = routine.windows.filter(
                    (w) => !w.log || (w.log.status !== "completed" && w.log.status !== "skipped")
                  );
                  Promise.all(
                    unchecked.map((w) => handleCheck(w.id, "completed"))
                  );
                }}
              >
                <Check className="h-3 w-3 mr-1" />
                Complete all windows
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
