"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CATEGORY_COLORS } from "@/lib/time-audit/constants";
import type { TagDistribution } from "@/lib/time-audit/summary";

const TAG_COLORS: Record<string, string> = {
  productive: CATEGORY_COLORS.productive,
  reactive: CATEGORY_COLORS.reactive,
  maintenance: CATEGORY_COLORS.maintenance,
  untracked: CATEGORY_COLORS.untracked,
};

interface TimeDistributionChartProps {
  distribution: TagDistribution[];
}

export function TimeDistributionChart({
  distribution,
}: TimeDistributionChartProps) {
  if (distribution.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Time Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data to display</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = distribution.map((d) => ({
    name: `${d.emoji} ${d.label}`,
    value: d.minutes,
    percentage: d.percentage,
    color: TAG_COLORS[d.category] ?? "hsl(var(--muted-foreground))",
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Time Distribution</CardTitle>
        <CardDescription>How you spent your time by activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => [
                  `${Math.floor((value as number) / 60)}h ${(value as number) % 60}m`,
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Detail list */}
        <div className="mt-4 space-y-2">
          {distribution.map((d) => (
            <div
              key={d.tag}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {d.emoji} {d.label}
              </span>
              <span className="text-muted-foreground">
                {Math.floor(d.minutes / 60)}h {d.minutes % 60}m ({d.percentage}
                %)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
