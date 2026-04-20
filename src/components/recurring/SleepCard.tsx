"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Moon, Sun, Check, Clock, ArrowUp, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SleepLogData {
  id: string;
  bedtime?: string | null;
  wakeTime?: string | null;
  durationMins?: number | null;
  bedtimeOnTime?: boolean | null;
  wakeOnTime?: boolean | null;
  targetBedtime?: string | null;
  targetWakeTime?: string | null;
}

export interface SleepCardTask {
  id: string;
  title: string;
  scheduledDate?: string | null;
  version: number;
  routine?: {
    id: string;
    color?: string | null;
    scheduleLabel: string;
    routineType?: string;
    targetBedtime?: string | null;
    targetWakeTime?: string | null;
    sleepLog?: SleepLogData | null;
  } | null;
}

interface SleepCardProps {
  task: SleepCardTask;
  onLogSleep?: (routineId: string, date: string, action: "bed" | "wake") => Promise<void>;
  onEditSleep?: (routineId: string, date: string, bedtime: string, wakeTime: string) => Promise<void>;
  onMoveToToday?: (taskId: string) => void;
  readonly?: boolean;
}

/** Format HH:MM (24h) to 12-hour display */
function formatTime24to12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Format an ISO timestamp to local time display */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Format duration in minutes to Xh Ym */
function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Calculate difference in minutes between actual time and target */
function getTimeDelta(actualIso: string, targetHHMM: string): { label: string; late: boolean } {
  const actual = new Date(actualIso);
  const actualMins = actual.getHours() * 60 + actual.getMinutes();
  const [tH, tM] = targetHHMM.split(":").map(Number);
  const targetMins = tH * 60 + tM;

  let diff = actualMins - targetMins;
  // Handle midnight wrap for bedtime (e.g., target 23:00, actual 00:30 = 90 min late)
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;

  const absDiff = Math.abs(diff);
  if (absDiff < 2) return { label: "on time", late: false };

  const hours = Math.floor(absDiff / 60);
  const mins = absDiff % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  return {
    label: diff > 0 ? `${timeStr} late` : `${timeStr} early`,
    late: diff > 0,
  };
}

/** Extract HH:MM from an ISO timestamp */
function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function SleepCard({ task, onLogSleep, onEditSleep, onMoveToToday, readonly }: SleepCardProps) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBedtime, setEditBedtime] = useState("");
  const [editWakeTime, setEditWakeTime] = useState("");
  const routine = task.routine;
  if (!routine) return null;

  const sleepLog = routine.sleepLog;
  const hasBedtime = !!sleepLog?.bedtime;
  const hasWakeTime = !!sleepLog?.wakeTime;
  const isComplete = hasBedtime && hasWakeTime;

  const borderColor = routine.color || "#6366f1"; // indigo default for sleep

  const scheduledDate = task.scheduledDate
    ? task.scheduledDate.split("T")[0]
    : new Date().toISOString().split("T")[0];

  const handleAction = async (action: "bed" | "wake") => {
    if (!onLogSleep || loading) return;
    setLoading(true);
    try {
      await onLogSleep(routine.id, scheduledDate, action);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = () => {
    setEditBedtime(sleepLog?.bedtime ? isoToHHMM(sleepLog.bedtime) : "23:00");
    setEditWakeTime(sleepLog?.wakeTime ? isoToHHMM(sleepLog.wakeTime) : "07:00");
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!onEditSleep || loading || !editBedtime || !editWakeTime) return;
    setLoading(true);
    try {
      await onEditSleep(routine.id, scheduledDate, editBedtime, editWakeTime);
      setEditing(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Card
        className={cn("transition-colors", isComplete && "opacity-60")}
        style={{ borderLeftColor: borderColor, borderLeftWidth: 4 }}
      >
        <CardContent className="py-3 px-4">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{task.title}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {routine.scheduleLabel}
            </Badge>
          </div>

          {/* State-specific content */}
          <div className="mt-2">
            {/* Edit form — shown when editing any state */}
            {editing && !readonly && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Bedtime</label>
                    <Input
                      type="time"
                      value={editBedtime}
                      onChange={(e) => setEditBedtime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Wake time</label>
                    <Input
                      type="time"
                      value={editWakeTime}
                      onChange={(e) => setEditWakeTime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={loading || !editBedtime || !editWakeTime}
                    className="h-7 text-xs"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                    className="h-7 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!editing && !hasBedtime && !readonly && (
              /* Evening state: show target + Going to Bed button + Edit */
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Target bedtime: {routine.targetBedtime ? formatTime24to12(routine.targetBedtime) : "—"}</span>
                </div>
                <div className="flex items-center gap-1">
                  {onEditSleep && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleStartEdit}>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Log manually</TooltipContent>
                    </Tooltip>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-950"
                    onClick={() => handleAction("bed")}
                    disabled={loading}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    Going to Bed
                  </Button>
                </div>
              </div>
            )}

            {!editing && hasBedtime && !hasWakeTime && !readonly && (
              /* Morning state: show bedtime + early/late + I'm Up button */
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Moon className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Bed at {formatTimestamp(sleepLog!.bedtime!)}</span>
                  {routine.targetBedtime && (
                    <OnTimeBadge
                      actualIso={sleepLog!.bedtime!}
                      targetHHMM={routine.targetBedtime}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Target wake: {routine.targetWakeTime ? formatTime24to12(routine.targetWakeTime) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {onEditSleep && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleStartEdit}>
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit times</TooltipContent>
                      </Tooltip>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
                      onClick={() => handleAction("wake")}
                      disabled={loading}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      I&apos;m Up
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!editing && isComplete && (
              /* Complete state: summary + edit button */
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <div className="flex items-center gap-1.5">
                  <Moon className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{formatTimestamp(sleepLog!.bedtime!)}</span>
                  {routine.targetBedtime && (
                    <OnTimeBadge
                      actualIso={sleepLog!.bedtime!}
                      targetHHMM={routine.targetBedtime}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  <span>{formatTimestamp(sleepLog!.wakeTime!)}</span>
                  {routine.targetWakeTime && (
                    <OnTimeBadge
                      actualIso={sleepLog!.wakeTime!}
                      targetHHMM={routine.targetWakeTime}
                    />
                  )}
                </div>
                {sleepLog!.durationMins != null && (
                  <Badge variant="secondary" className="text-[10px]">
                    {formatDuration(sleepLog!.durationMins)}
                  </Badge>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  {onEditSleep && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleStartEdit}>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit times</TooltipContent>
                    </Tooltip>
                  )}
                  <Check className="h-4 w-4 text-green-600" />
                </div>
              </div>
            )}

            {/* Readonly upcoming: Move to Today */}
            {readonly && !isComplete && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {routine.targetBedtime ? formatTime24to12(routine.targetBedtime) : "—"}
                    {" — "}
                    {routine.targetWakeTime ? formatTime24to12(routine.targetWakeTime) : "—"}
                  </span>
                </div>
                {onMoveToToday && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onMoveToToday(task.id)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move to today</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

/** Small badge showing early/on-time/late status */
function OnTimeBadge({ actualIso, targetHHMM }: { actualIso: string; targetHHMM: string }) {
  const delta = getTimeDelta(actualIso, targetHHMM);
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] shrink-0",
        delta.late
          ? "text-red-600 border-red-200 dark:text-red-400 dark:border-red-800"
          : "text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
      )}
    >
      {delta.label}
    </Badge>
  );
}
