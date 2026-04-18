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

interface VelocityData {
  data: { week: string; completedCount: number; completedMins: number }[];
  averagePerWeek: number;
  averageMinsPerWeek?: number;
  lookbackWeeks?: number;
  trend?: { direction: "up" | "down"; percent: number } | null;
}

interface VelocityWidgetProps {
  data: VelocityData;
  onLookbackChange?: (weeks: number) => void;
}

const LOOKBACK_OPTIONS = [
  { value: 4, label: "4w" },
  { value: 12, label: "12w" },
  { value: 26, label: "26w" },
];

export function VelocityWidget({ data, onLookbackChange }: VelocityWidgetProps) {
  const lookbackWeeks = data.lookbackWeeks ?? 12;

  if (data.data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Velocity</CardTitle>
              <CardDescription>Last {lookbackWeeks} weeks &middot; tasks/week</CardDescription>
            </div>
            {onLookbackChange && (
              <LookbackDropdown
                value={lookbackWeeks}
                onChange={onLookbackChange}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No completed tasks yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Velocity</CardTitle>
            <CardDescription>Last {lookbackWeeks} weeks &middot; tasks/week</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {onLookbackChange && (
              <LookbackDropdown
                value={lookbackWeeks}
                onChange={onLookbackChange}
              />
            )}
            <div className="text-right">
              <p className="text-2xl font-bold">{data.averagePerWeek}</p>
              <p className="text-xs text-muted-foreground">avg/week</p>
              {data.trend && (
                <Badge
                  variant="outline"
                  className={
                    data.trend.direction === "up"
                      ? "border-green-500 text-green-600 dark:text-green-400 mt-1"
                      : "border-red-500 text-red-600 dark:text-red-400 mt-1"
                  }
                >
                  {data.trend.direction === "up" ? "\u25B2" : "\u25BC"}{" "}
                  {data.trend.percent}%
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.data}>
              <defs>
                <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
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
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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
                allowDecimals={false}
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
                  const p = payload[0].payload as {
                    week: string;
                    completedCount: number;
                    completedMins: number;
                  };
                  const hours =
                    Math.round((p.completedMins / 60) * 10) / 10;
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
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={data.averagePerWeek}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: "Avg",
                  position: "right",
                  style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                }}
              />
              <Area
                type="monotone"
                dataKey="completedCount"
                stroke="hsl(var(--primary))"
                fill="url(#velocityGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function LookbackDropdown({
  value,
  onChange,
}: {
  value: number;
  onChange: (weeks: number) => void;
}) {
  return (
    <div className="flex items-center rounded-md border text-xs">
      {LOOKBACK_OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 transition-colors ${
            i === 0
              ? "rounded-l-md"
              : i === LOOKBACK_OPTIONS.length - 1
                ? "rounded-r-md"
                : ""
          } ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
