"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Moon, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

export interface SleepPerfData {
  avgDurationMins: number | null;
  onTimeBedtimeRate: number | null;
  lateNightCompletionRate: number | null;
  onTimeCompletionRate: number | null;
  lateNightDays: number;
  onTimeNightDays: number;
  totalNights: number;
  daily: {
    date: string;
    deviationMins: number | null;
    nextDayCompletionRate: number | null;
  }[];
}

interface Props {
  current: SleepPerfData | null;
  prior: SleepPerfData | null;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function TrendIndicator({ current, prior, suffix = "" }: { current: number | null; prior: number | null; suffix?: string }) {
  if (current == null || prior == null || prior === 0) return null;
  const diff = current - prior;
  if (diff === 0) return <span className="text-xs text-muted-foreground ml-1">same</span>;
  return (
    <span className="text-xs text-muted-foreground ml-1">
      {diff > 0 ? "+" : ""}{diff}{suffix} vs prior
    </span>
  );
}

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtext,
  trend,
}: {
  icon: typeof Moon;
  iconColor: string;
  label: string;
  value: string;
  subtext?: string;
  trend?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">{value}</span>
          {trend}
        </div>
        {subtext && (
          <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatChartDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function SleepPerformanceWidget({ current, prior }: Props) {
  if (!current || current.totalNights === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Moon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sleep data for this period.</p>
          <p className="text-xs mt-1">Log bedtime and wake time in your Card File to see insights here.</p>
        </CardContent>
      </Card>
    );
  }

  // Compute the impact delta for the third card
  const impactDelta = current.onTimeCompletionRate != null && current.lateNightCompletionRate != null
    ? current.onTimeCompletionRate - current.lateNightCompletionRate
    : null;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Moon}
          iconColor="text-indigo-500"
          label="Avg Sleep"
          value={current.avgDurationMins != null ? formatDuration(current.avgDurationMins) : "—"}
          subtext={`${current.totalNights} night${current.totalNights !== 1 ? "s" : ""} tracked`}
          trend={
            current.avgDurationMins != null && prior?.avgDurationMins != null ? (
              <TrendIndicator current={current.avgDurationMins} prior={prior.avgDurationMins} suffix="m" />
            ) : null
          }
        />
        <StatCard
          icon={Clock}
          iconColor="text-green-500"
          label="On-Time Bedtime"
          value={current.onTimeBedtimeRate != null ? `${current.onTimeBedtimeRate}%` : "—"}
          subtext={`${current.onTimeNightDays} of ${current.totalNights} nights`}
          trend={
            <TrendIndicator current={current.onTimeBedtimeRate} prior={prior?.onTimeBedtimeRate ?? null} suffix="%" />
          }
        />
        <StatCard
          icon={Zap}
          iconColor="text-amber-500"
          label="Late Night Impact"
          value={
            impactDelta != null
              ? `${impactDelta > 0 ? "-" : "+"}${Math.abs(impactDelta)}%`
              : "—"
          }
          subtext={
            current.lateNightDays > 0 && current.lateNightCompletionRate != null
              ? `${current.lateNightCompletionRate}% completion after late nights vs ${current.onTimeCompletionRate}% after on-time`
              : current.lateNightDays === 0
                ? "No late nights this period"
                : "Not enough data"
          }
        />
      </div>

      {/* Daily chart */}
      {current.daily.length > 1 && (
        <Card>
          <CardContent className="pt-4 pb-2 px-4">
            <p className="text-sm font-medium mb-3">Bedtime Deviation & Next-Day Performance</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={current.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartDate}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="deviation"
                    orientation="left"
                    tick={{ fontSize: 11 }}
                    label={{ value: "min", angle: -90, position: "insideLeft", style: { fontSize: 10 } }}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    label={{ value: "%", angle: 90, position: "insideRight", style: { fontSize: 10 } }}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => {
                      const v = Number(value);
                      if (name === "Deviation") {
                        return [`${v > 0 ? "+" : ""}${v} min (${v > 0 ? "late" : `${Math.abs(v)} min early`})`, name];
                      }
                      return [`${v}%`, "Next-Day Completion"];
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(label: any) => formatChartDate(String(label))}
                  />
                  <Legend />
                  <ReferenceLine yAxisId="deviation" y={0} stroke="#888" strokeDasharray="3 3" />
                  <Bar
                    yAxisId="deviation"
                    dataKey="deviationMins"
                    name="Deviation"
                    fill="#6366f1"
                    opacity={0.7}
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="rate"
                    dataKey="nextDayCompletionRate"
                    name="Next-Day Completion"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
