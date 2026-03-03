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
  data: { date: string; remaining?: number; ideal?: number }[];
  totalEstimate: number;
  unit?: "hours" | "tasks";
  targetDate?: string | null;
}

export interface VelocityData {
  data: { week: string; completedCount: number; completedMins: number }[];
  averagePerWeek: number;
  averageMinsPerWeek?: number;
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

  if (velocityPerWeek <= 0) return null;

  // Current remaining — find the last data point with an actual remaining value
  // (future ideal-only points have no remaining)
  const lastActualPoint = [...data].reverse().find((d) => d.remaining != null);
  if (!lastActualPoint) return null;
  const remaining = lastActualPoint.remaining!;

  if (remaining <= 0) return null;

  // Weeks until completion
  const weeksUntilDone = remaining / velocityPerWeek;
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
    velocityPerWeek: Math.round(velocityPerWeek * 10) / 10,
    unit,
  };
}

/**
 * Build projected trend line data points from last actual data point to projected zero.
 */
function buildProjectionLine(
  burnDown: BurnDownData,
  projection: ProjectedCompletion
): { date: string; projected: number }[] {
  const { data } = burnDown;
  // Use the last actual data point (with remaining), not future ideal-only points
  const lastPoint = [...data].reverse().find((d) => d.remaining != null) ?? data[data.length - 1];
  const remaining = lastPoint.remaining ?? 0;
  const lastDate = new Date(lastPoint.date + "T00:00:00");
  const endDate = new Date(projection.date + "T00:00:00");

  const points: { date: string; projected: number }[] = [];

  // Start point
  points.push({ date: lastPoint.date, projected: remaining });

  // Intermediate points (every 7 days)
  const totalDays = Math.ceil(
    (endDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const steps = Math.min(Math.ceil(totalDays / 7), 12); // Cap at 12 points
  for (let i = 1; i <= steps; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + Math.round((totalDays * i) / steps));
    const ratio = i / steps;
    points.push({
      date: d.toISOString().slice(0, 10),
      projected: Math.round(remaining * (1 - ratio)),
    });
  }

  return points;
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
    if (!projection) return data.data;

    const projectionLine = buildProjectionLine(data, projection);

    // Merge projection into chart data
    const merged = new Map<
      string,
      { date: string; remaining?: number; ideal?: number; projected?: number }
    >();

    for (const d of data.data) {
      merged.set(d.date, { ...d });
    }

    for (const p of projectionLine) {
      const existing = merged.get(p.date);
      if (existing) {
        existing.projected = p.projected;
      } else {
        merged.set(p.date, { date: p.date, projected: p.projected });
      }
    }

    return Array.from(merged.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [data, projection]);

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
                dataKey="ideal"
                name="Ideal"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
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
              {/* Projected completion trend line */}
              {projection && (
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke={
                    projection.isPastDeadline
                      ? "#F59E0B" // amber-500
                      : "#22C55E" // green-500
                  }
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                />
              )}
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
