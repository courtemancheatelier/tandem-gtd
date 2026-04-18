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

export interface BurnUpResponse {
  data: { date: string; scope: number; completed: number; ideal?: number }[];
  projectedCompletionPoints: { date: string; projected: number }[];
  projectedScopePoints: { date: string; projectedScope: number }[];
  scopeChanges: { date: string; delta: number; reason: string }[];
  convergence: {
    date: string | null;
    display: string | null;
    daysFromNow: number | null;
    isPastDeadline: boolean;
    completionVelocityPerWeek: number;
    scopeVelocityPerWeek: number;
    isConverging: boolean;
  } | null;
  meta: {
    unit: "tasks" | "hours";
    targetDate: string | null;
    currentScope: number;
    currentCompleted: number;
  };
  warnings: string[];
}

interface BurnUpChartProps {
  data: BurnUpResponse;
  title?: string;
  compact?: boolean;
}

export function BurnUpChart({ data, title, compact }: BurnUpChartProps) {
  const { convergence, meta, scopeChanges } = data;

  const chartData = useMemo(() => {
    const merged = new Map<
      string,
      {
        date: string;
        scope?: number;
        completed?: number;
        ideal?: number;
        projected?: number;
        projectedScope?: number;
      }
    >();

    // Main data points
    for (const d of data.data) {
      merged.set(d.date, { ...d });
    }

    // Projected completion points
    for (const p of data.projectedCompletionPoints) {
      const existing = merged.get(p.date);
      if (existing) {
        existing.projected = p.projected;
      } else {
        merged.set(p.date, { date: p.date, projected: p.projected });
      }
    }

    // Projected scope points
    for (const p of data.projectedScopePoints) {
      const existing = merged.get(p.date);
      if (existing) {
        existing.projectedScope = p.projectedScope;
      } else {
        merged.set(p.date, { date: p.date, projectedScope: p.projectedScope });
      }
    }

    return Array.from(merged.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [data]);

  const unitLabel = meta.unit === "hours" ? "Hours" : "Tasks";
  const gap = meta.currentScope - meta.currentCompleted;

  if (data.data.length === 0 || meta.currentScope === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title ?? "Burn-Up"}</CardTitle>
          <CardDescription>Scope vs completed over time</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No data to chart yet
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
            <CardTitle className="text-base">{title ?? "Burn-Up"}</CardTitle>
            <CardDescription>
              {meta.currentCompleted}/{meta.currentScope} {unitLabel.toLowerCase()} completed · {round2(gap)} remaining
            </CardDescription>
          </div>

          {/* Convergence badge */}
          {convergence && (
            <div className="flex items-center gap-2">
              {convergence.isConverging ? (
                <Badge
                  variant="outline"
                  className={
                    convergence.isPastDeadline
                      ? "border-amber-500 text-amber-600 dark:text-amber-400"
                      : "border-green-500 text-green-600 dark:text-green-400"
                  }
                >
                  Converges: {convergence.display}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-red-500 text-red-600 dark:text-red-400"
                >
                  Scope outpacing work
                </Badge>
              )}
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {round2(convergence.completionVelocityPerWeek)} {unitLabel.toLowerCase()}/wk done
                {convergence.scopeVelocityPerWeek > 0 &&
                  ` · +${round2(convergence.scopeVelocityPerWeek)}/wk added`}
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
                  value: unitLabel,
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
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />

              {/* Total Scope line */}
              <Line
                type="stepAfter"
                dataKey="scope"
                name="Total Scope"
                stroke="#F43F5E"
                dot={false}
                strokeWidth={2}
                connectNulls
              />

              {/* Completed Work line */}
              <Line
                type="stepAfter"
                dataKey="completed"
                name="Completed"
                stroke="#3B82F6"
                dot={false}
                strokeWidth={2}
                connectNulls
              />

              {/* Ideal line (only if targetDate provided) */}
              {data.data.some((d) => d.ideal != null) && (
                <Line
                  type="monotone"
                  dataKey="ideal"
                  name="Ideal"
                  stroke="#22C55E"
                  strokeDasharray="5 5"
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                />
              )}

              {/* Projected completion (dashed blue) */}
              {data.projectedCompletionPoints.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected Completion"
                  stroke="#3B82F6"
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                />
              )}

              {/* Projected scope (dashed rose) */}
              {data.projectedScopePoints.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="projectedScope"
                  name="Projected Scope"
                  stroke="#F43F5E"
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

              {/* Scope change annotations */}
              {scopeChanges.map((sc) => (
                <ReferenceLine
                  key={sc.date}
                  x={sc.date}
                  stroke="#F59E0B"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                  label={{
                    value: sc.delta > 0 ? `+${sc.delta}` : `${sc.delta}`,
                    position: "top",
                    fill: "#F59E0B",
                    fontSize: 9,
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
