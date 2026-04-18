"use client";

import { useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

export interface BurnDownData {
  data: { date: string; remaining?: number; ideal?: number; target?: number }[];
  totalEstimate: number;
  unit?: "hours" | "tasks";
  targetDate?: string | null;
  startDate?: string | null;
}

export interface VelocityData {
  data: { week: string; completedCount: number; completedMins: number }[];
  averagePerWeek: number;
  averageMinsPerWeek?: number;
  velocityMultiplier?: number | null;
}

interface ProjectedCompletion {
  /** The ISO date string of projected completion */
  date: string;
  /** Formatted display string e.g. "Mar 15" */
  display: string;
  /** Days from today */
  daysFromNow: number;
  /** Whether the projection is past the target date */
  isPastDeadline: boolean;
  /** Velocity used for projection (hours/week or tasks/week) */
  velocityPerWeek: number;
  /** The unit of velocity */
  unit: "hours" | "tasks";
}

/**
 * Compute projected completion based on recent velocity.
 *
 * Uses the velocity data (hours or tasks completed per week over the last 12 weeks)
 * to extrapolate when remaining work will hit zero.
 */
function computeProjection(
  burnDown: BurnDownData,
  velocity: VelocityData
): ProjectedCompletion | null {
  const { data } = burnDown;
  const unit = burnDown.unit ?? "hours";
  if (data.length < 2) return null;

  // Get recent velocity (use last 4 weeks for more responsive projection)
  const recentWeeks = velocity.data.slice(-4);
  if (recentWeeks.length === 0) return null;

  let velocityPerWeek: number;
  if (unit === "tasks") {
    const totalCompleted = recentWeeks.reduce(
      (sum, w) => sum + w.completedCount,
      0
    );
    velocityPerWeek = totalCompleted / recentWeeks.length;
  } else {
    const totalMinsCompleted = recentWeeks.reduce(
      (sum, w) => sum + w.completedMins,
      0
    );
    velocityPerWeek = totalMinsCompleted / 60 / recentWeeks.length;
  }

  // Adjust velocity by multiplier: if tasks take 1.3x longer than estimated,
  // the team burns through estimated hours at 1/1.3x the raw rate
  const adjustedVelocity = velocity.velocityMultiplier
    ? velocityPerWeek / velocity.velocityMultiplier
    : velocityPerWeek;

  if (adjustedVelocity <= 0) return null;

  // Current remaining — find the last data point with an actual remaining value
  // (future ideal-only points have no remaining)
  const lastActualPoint = [...data].reverse().find((d) => d.remaining != null);
  if (!lastActualPoint) return null;
  const remaining = lastActualPoint.remaining!;

  if (remaining <= 0) return null;

  // Weeks until completion
  const weeksUntilDone = remaining / adjustedVelocity;
  const daysUntilDone = Math.ceil(weeksUntilDone * 7);

  // Compute projected date
  const lastActualDate = new Date(lastActualPoint.date + "T00:00:00");
  const projectedDate = new Date(lastActualDate);
  projectedDate.setDate(projectedDate.getDate() + daysUntilDone);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromNow = Math.ceil(
    (projectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check if past target date
  const isPastDeadline = burnDown.targetDate
    ? projectedDate > new Date(burnDown.targetDate)
    : false;

  const display = projectedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      projectedDate.getFullYear() !== today.getFullYear()
        ? "numeric"
        : undefined,
  });

  return {
    date: projectedDate.toISOString().slice(0, 10),
    display,
    daysFromNow,
    isPastDeadline,
    velocityPerWeek: Math.round(adjustedVelocity * 10) / 10,
    unit,
  };
}

// ─── Component ────────────────────────────────────────────────────────

export function BurnDownWidget({
  data,
  velocity,
  title,
  description,
  compact,
}: {
  data: BurnDownData;
  velocity?: VelocityData;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const unit = data.unit ?? "hours";

  const projection = useMemo(() => {
    if (!velocity) return null;
    return computeProjection(data, velocity);
  }, [data, velocity]);

  const chartData = useMemo(() => {
    return [...data.data].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const yAxisLabel = unit === "tasks" ? "Tasks" : "Hours";

  const emptyMessage =
    unit === "tasks" ? "No tasks to chart" : "No estimated tasks to chart";

  if (data.data.length === 0 || data.totalEstimate === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title ?? "Burn-Down"}</CardTitle>
          <CardDescription>{description ?? "Last 30 days"}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const defaultDescription =
    unit === "tasks"
      ? `${data.totalEstimate} tasks remaining`
      : `${data.totalEstimate}h remaining`;

  const velocityLabel = projection
    ? unit === "tasks"
      ? `${projection.velocityPerWeek}/wk pace`
      : `${projection.velocityPerWeek}h/wk pace`
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{title ?? "Burn-Down"}</CardTitle>
            <CardDescription>
              {description ?? defaultDescription}
            </CardDescription>
          </div>

          {/* Projected completion callout */}
          {projection && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  projection.isPastDeadline
                    ? "border-amber-500 text-amber-600 dark:text-amber-400"
                    : "border-green-500 text-green-600 dark:text-green-400"
                }
              >
                Projected: {projection.display}
              </Badge>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {projection.daysFromNow > 0
                  ? `${projection.daysFromNow}d away`
                  : "overdue"}{" "}
                · {velocityLabel}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className={compact ? "h-[180px]" : "h-[220px]"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => {
                  const d = new Date(String(val) + "T00:00:00");
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                label={{
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                labelFormatter={(label) => {
                  const d = new Date(String(label) + "T00:00:00");
                  return d.toLocaleDateString();
                }}
                formatter={(value, name) => {
                  const suffix = unit === "tasks" ? " tasks" : "h";
                  return [`${value}${suffix}`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="target"
                name="Target"
                stroke="#F59E0B"
                strokeDasharray="5 5"
                dot={false}
                strokeWidth={1.5}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ideal"
                name="Ideal"
                stroke="#22C55E"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={1.5}
                connectNulls
              />
              <Line
                type="stepAfter"
                dataKey="remaining"
                name="Actual"
                stroke="hsl(var(--primary))"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              {/* Today reference line */}
              <ReferenceLine
                x={new Date().toISOString().slice(0, 10)}
                stroke="hsl(var(--destructive))"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{
                  value: "Today",
                  position: "top",
                  fill: "hsl(var(--destructive))",
                  fontSize: 10,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
