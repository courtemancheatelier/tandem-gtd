"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Clock, AlertTriangle, ArrowUp } from "lucide-react";
import { DeferPopover } from "./DeferPopover";
import { SkipPopover } from "./SkipPopover";
import { cn } from "@/lib/utils";

interface RecurringCardTask {
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
    skipStreak?: number;
    targetTime?: string | null;
    dueByTime?: string | null;
    progression?: {
      currentValue: number;
      unit: string;
      label: string;
    } | null;
    windows: unknown[];
  } | null;
}

interface RecurringCardProps {
  task: RecurringCardTask;
  onComplete: (taskId: string, note?: string) => void;
  onSkip: (taskId: string, note?: string) => void;
  onDefer: (taskId: string, date: string) => void;
  onMoveToToday?: (taskId: string) => void;
  /** Hide action buttons (used for upcoming cards that aren't actionable yet) */
  readonly?: boolean;
}

/** SVG tally marks — groups of 5 (four vertical + one diagonal slash), like real tally counting. */
function TallyMarks({ count }: { count: number }) {
  if (count <= 0) return null;
  const label =
    count === 1
      ? "Skipped once"
      : `Skipped ${count} time${count > 1 ? "s" : ""} in a row`;

  const fullGroups = Math.floor(count / 5);
  const remainder = count % 5;
  const groupWidth = 36; // 4 strokes * 8px spacing + 4px padding
  const gapBetweenGroups = 6;
  const totalGroups = fullGroups + (remainder > 0 ? 1 : 0);
  const totalWidth =
    totalGroups > 0
      ? fullGroups * groupWidth +
        (remainder > 0 ? remainder * 8 + 4 : 0) +
        (totalGroups - 1) * gapBetweenGroups
      : 0;

  let offsetX = 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <svg
          className="shrink-0"
          width={totalWidth}
          height={16}
          viewBox={`0 0 ${totalWidth} 16`}
          aria-label={label}
        >
          {/* Full groups of 5: four vertical strokes + one diagonal slash */}
          {Array.from({ length: fullGroups }).map((_, g) => {
            const gx = g * (groupWidth + gapBetweenGroups);
            return (
              <g key={`g${g}`}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <line
                    key={i}
                    x1={gx + i * 8 + 4}
                    y1={14}
                    x2={gx + i * 8 + 4}
                    y2={2}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    className="text-amber-500/70"
                  />
                ))}
                {/* Diagonal slash through the group */}
                <line
                  x1={gx}
                  y1={12}
                  x2={gx + 32}
                  y2={4}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="text-amber-500/70"
                />
              </g>
            );
          })}
          {/* Remaining strokes (vertical only, no slash) */}
          {remainder > 0 &&
            (() => {
              offsetX = fullGroups > 0
                ? fullGroups * (groupWidth + gapBetweenGroups)
                : 0;
              return Array.from({ length: remainder }).map((_, i) => (
                <line
                  key={`r${i}`}
                  x1={offsetX + i * 8 + 4}
                  y1={14}
                  x2={offsetX + i * 8 + 4}
                  y2={2}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="text-amber-500/70"
                />
              ));
            })()}
        </svg>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function RecurringCard({ task, onComplete, onSkip, onDefer, onMoveToToday, readonly }: RecurringCardProps) {
  const routine = task.routine;
  const color = routine?.color;
  const mins = task.estimatedMins ?? routine?.estimatedMins;
  const skipStreak = routine?.skipStreak ?? 0;
  const targetTime = routine?.targetTime;
  const isOverdue = task.isOverdueWithinDay;
  const isDailyFrequency = routine?.scheduleLabel === "Every day" || routine?.scheduleLabel?.startsWith("Weekdays");

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-colors",
        isOverdue && "ring-1 ring-amber-400/50"
      )}
      style={color ? { borderLeftColor: color, borderLeftWidth: "4px" } : undefined}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm leading-tight">{task.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {routine && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {routine.scheduleLabel}
                </Badge>
              )}
              {routine?.progression && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  {routine.progression.label}
                </Badge>
              )}
              {task.context && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                  style={task.context.color ? { borderColor: task.context.color, color: task.context.color } : undefined}
                >
                  {task.context.name}
                </Badge>
              )}
              {task.project && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {task.project.title}
                </Badge>
              )}
              {targetTime && (
                <span className={cn(
                  "flex items-center gap-0.5 text-[10px]",
                  isOverdue ? "text-amber-600 font-medium" : "text-muted-foreground"
                )}>
                  {isOverdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                  {targetTime}
                  {isOverdue && " past due"}
                </span>
              )}
              {mins && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {mins}m
                </span>
              )}
              {skipStreak > 0 && <TallyMarks count={skipStreak} />}
            </div>
          </div>
          {readonly && onMoveToToday && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={() => onMoveToToday(task.id)}
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
          {!readonly && (
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-1 shrink-0">
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
                {!isDailyFrequency && (
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <SkipPopover
                        skipStreak={skipStreak}
                        onSkip={(note) => onSkip(task.id, note)}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Skip — skip this one, schedule next</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
