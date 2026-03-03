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
import { Check, SkipForward, Clock } from "lucide-react";
import { DeferPopover } from "./DeferPopover";
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
  recurringTemplate?: {
    id: string;
    color?: string | null;
    estimatedMins?: number | null;
    scheduleLabel: string;
    skipStreak?: number;
  } | null;
}

interface RecurringCardProps {
  task: RecurringCardTask;
  onComplete: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onDefer: (taskId: string, date: string) => void;
}

/** SVG tally marks — pencil-style diagonal lines like the SHE card system. */
function TallyMarks({ count }: { count: number }) {
  if (count <= 0) return null;
  // Show up to 5 marks (one group); cap display at 5
  const marks = Math.min(count, 5);
  const label =
    count === 1
      ? "Skipped once"
      : `Skipped ${count} time${count > 1 ? "s" : ""} in a row`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <svg
          className="shrink-0"
          width={marks * 8 + 4}
          height={16}
          viewBox={`0 0 ${marks * 8 + 4} 16`}
          aria-label={label}
        >
          {Array.from({ length: marks }).map((_, i) => (
            <line
              key={i}
              x1={i * 8 + 2}
              y1={14}
              x2={i * 8 + 6}
              y2={2}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="text-amber-500/70"
            />
          ))}
          {marks >= 5 && (
            <line
              x1={0}
              y1={10}
              x2={marks * 8 + 2}
              y2={5}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="text-amber-500/70"
            />
          )}
        </svg>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function RecurringCard({ task, onComplete, onSkip, onDefer }: RecurringCardProps) {
  const color = task.recurringTemplate?.color;
  const mins = task.estimatedMins ?? task.recurringTemplate?.estimatedMins;
  const skipStreak = task.recurringTemplate?.skipStreak ?? 0;

  return (
    <Card
      className={cn("relative overflow-hidden transition-colors")}
      style={color ? { borderLeftColor: color, borderLeftWidth: "4px" } : undefined}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm leading-tight">{task.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {task.recurringTemplate && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {task.recurringTemplate.scheduleLabel}
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
              {mins && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {mins}m
                </span>
              )}
              {skipStreak > 0 && <TallyMarks count={skipStreak} />}
            </div>
          </div>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => onSkip(task.id)}
                    disabled={skipStreak >= 2}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{skipStreak >= 2 ? "Can't skip — do it or defer" : "Skip — skip this one, schedule next"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
