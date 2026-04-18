"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, ArrowLeft, Flame, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface WindowStat {
  windowId: string;
  title: string;
  targetTime: string | null;
  sortOrder: number;
  completed: number;
  skipped: number;
  missed: number;
  total: number;
  completionRate: number;
}

interface DailyEntry {
  date: string;
  windows: { windowId: string; status: string }[];
}

interface ComplianceData {
  routineId: string;
  routineTitle: string;
  color: string | null;
  days: number;
  totalActiveDays: number;
  overall: {
    totalSlots: number;
    completed: number;
    skipped: number;
    missed: number;
    completionRate: number;
    currentStreak: number;
    bestStreak: number;
  };
  windows: WindowStat[];
  dailyGrid: DailyEntry[];
}

const RANGE_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

function rateColor(rate: number): string {
  if (rate >= 90) return "text-green-600";
  if (rate >= 70) return "text-yellow-600";
  if (rate >= 50) return "text-orange-600";
  return "text-red-600";
}

function rateBgColor(rate: number): string {
  if (rate >= 90) return "bg-green-500";
  if (rate >= 70) return "bg-yellow-500";
  if (rate >= 50) return "bg-orange-500";
  return "bg-red-500";
}

function statusCellColor(status: string): string {
  if (status === "completed") return "bg-green-500";
  if (status === "skipped") return "bg-amber-400";
  return "bg-muted";
}

function statusLabel(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "skipped") return "Skipped";
  return "Missed";
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ComplianceDashboard({ routineId }: { routineId: string }) {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/routines/${routineId}/compliance?days=${days}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [routineId, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        Failed to load compliance data.
      </div>
    );
  }

  const color = data.color ?? "#6366F1";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings/routines">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            {data.routineTitle}
          </h1>
          <p className="text-muted-foreground text-sm">Compliance Dashboard</p>
        </div>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={days === opt.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className={cn("text-3xl font-bold", rateColor(data.overall.completionRate))}>
              {data.overall.completionRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Completion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold flex items-center justify-center gap-1">
              <Flame className="h-6 w-6 text-orange-500" />
              {data.overall.currentStreak}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold flex items-center justify-center gap-1">
              <Trophy className="h-5 w-5 text-amber-500" />
              {data.overall.bestStreak}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Best Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{data.totalActiveDays}</div>
            <p className="text-xs text-muted-foreground mt-1">Days Tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          {data.overall.completed} completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          {data.overall.skipped} skipped
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted" />
          {data.overall.missed} missed
        </span>
      </div>

      {/* Per-window completion bars */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Window Adherence
          </CardTitle>
          <CardDescription>
            Completion rate per window over the last {days} days
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.windows.map((w) => (
            <div key={w.windowId} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {w.targetTime && (
                    <span className="text-muted-foreground mr-1">{w.targetTime}</span>
                  )}
                  {w.title}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("font-semibold text-xs", rateColor(w.completionRate))}>
                    {w.completionRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {w.completed}/{w.total}
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", rateBgColor(w.completionRate))}
                  style={{ width: `${w.completionRate}%` }}
                />
              </div>
              {w.skipped > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {w.skipped} skipped, {w.missed} missed
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Daily status grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daily Log</CardTitle>
          <CardDescription>
            Each column is a window. Hover for details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Column headers */}
          <div className="flex items-center gap-1 mb-2 pl-[88px]">
            {data.windows.map((w) => (
              <TooltipProvider key={w.windowId}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-5 text-center">
                      <span className="text-[9px] text-muted-foreground font-medium truncate block">
                        {w.title.slice(0, 2)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{w.title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
          {/* Rows */}
          <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
            {[...data.dailyGrid].reverse().map((day) => (
              <div key={day.date} className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground w-[84px] shrink-0 text-right pr-1">
                  {formatShortDate(day.date)}
                </span>
                {day.windows.map((w) => (
                  <TooltipProvider key={w.windowId}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "h-4 w-5 rounded-sm",
                            statusCellColor(w.status)
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {formatDayLabel(day.date)} —{" "}
                          {data.windows.find((ws) => ws.windowId === w.windowId)?.title}
                        </p>
                        <p className="text-xs font-medium">
                          {statusLabel(w.status)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {/* Day-level indicator */}
                {day.windows.every((w) => w.status === "completed" || w.status === "skipped") ? (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 border-green-400 text-green-600">
                    all
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
