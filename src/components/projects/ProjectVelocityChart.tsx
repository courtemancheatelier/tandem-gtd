"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ScopeChange {
  tasksAdded: number;
  tasksRemoved: number;
  net: number;
}

interface VelocityPoint {
  week: string;
  completedCount: number;
  completedMins: number;
  scopeChange?: ScopeChange;
}

export interface ProjectVelocityResponse {
  data: VelocityPoint[];
  averagePerWeek: number;
  averageMinsPerWeek: number;
  trend: { direction: "up" | "down"; percent: number } | null;
  velocityMultiplier?: number | null;
  meta: { unit: "tasks" | "hours"; lookbackWeeks: number };
  warnings: string[];
}

interface ProjectVelocityChartProps {
  data: ProjectVelocityResponse;
  title?: string;
  compact?: boolean;
}

export function ProjectVelocityChart({
  data,
  title,
  compact,
}: ProjectVelocityChartProps) {
  const { meta, trend } = data;
  const isHours = meta.unit === "hours";
  const unitLabel = isHours ? "hours" : "tasks";

  // Transform data for the chart
  const chartData = data.data.map((d) => ({
    week: d.week,
    value: isHours ? Math.round((d.completedMins / 60) * 10) / 10 : d.completedCount,
    completedCount: d.completedCount,
    completedMins: d.completedMins,
    scopeChange: d.scopeChange,
  }));

  // Compute average line value in display units
  const avgValue = data.averagePerWeek;

  // Scope annotation weeks (|net| >= 3)
  const scopeAnnotationWeeks = data.data.filter(
    (d) => d.scopeChange && Math.abs(d.scopeChange.net) >= 3
  );

  if (data.data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {title ?? "Velocity"}
          </CardTitle>
          <CardDescription>
            Last {meta.lookbackWeeks} weeks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No completed tasks in this period
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">
              {title ?? "Velocity"}
            </CardTitle>
            <CardDescription>
              Last {meta.lookbackWeeks} weeks &middot; {unitLabel}/week
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{avgValue}</p>
            <p className="text-xs text-muted-foreground">avg/week</p>
            {trend && (
              <Badge
                variant="outline"
                className={
                  trend.direction === "up"
                    ? "border-green-500 text-green-600 dark:text-green-400 mt-1"
                    : "border-red-500 text-red-600 dark:text-red-400 mt-1"
                }
              >
                {trend.direction === "up" ? "\u25B2" : "\u25BC"} {trend.percent}%
              </Badge>
            )}
            {data.velocityMultiplier != null && (
              <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 mt-1">
                Pace: {Math.round(data.velocityMultiplier * 100) / 100}x estimates
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className={compact ? "h-[180px]" : "h-[220px]"}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient
                  id="projVelocityGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
              />
              <XAxis
                dataKey="week"
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
                allowDecimals={isHours}
                label={{
                  value: isHours ? "Hours" : "Tasks",
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
                content={({ active, payload, label }) => {
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload as typeof chartData[number];
                  const hours = Math.round((p.completedMins / 60) * 10) / 10;
                  return (
                    <div
                      style={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "12px",
                        padding: "8px 12px",
                      }}
                    >
                      <p className="font-medium mb-1">
                        Week of{" "}
                        {new Date(
                          String(label) + "T00:00:00"
                        ).toLocaleDateString()}
                      </p>
                      <p>Tasks completed: {p.completedCount}</p>
                      <p>Hours completed: {hours}h</p>
                      {p.scopeChange && p.scopeChange.net !== 0 && (
                        <p className="text-muted-foreground mt-1">
                          Scope: {p.scopeChange.net > 0 ? "+" : ""}
                          {p.scopeChange.net} tasks
                        </p>
                      )}
                    </div>
                  );
                }}
              />

              {/* Average reference line */}
              <ReferenceLine
                y={avgValue}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: "Avg",
                  position: "right",
                  style: {
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  },
                }}
              />

              {/* Scope annotations for weeks with |net| >= 3 */}
              {scopeAnnotationWeeks.map((d) => (
                <ReferenceLine
                  key={d.week}
                  x={d.week}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  label={{
                    value:
                      d.scopeChange!.net > 0
                        ? `+${d.scopeChange!.net}`
                        : `${d.scopeChange!.net}`,
                    position: "top",
                    fill: "#F59E0B",
                    fontSize: 9,
                  }}
                />
              ))}

              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="url(#projVelocityGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
