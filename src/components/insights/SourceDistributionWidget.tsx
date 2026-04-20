"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
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

interface SourceEntry {
  source: string;
  count: number;
  percentage: number;
}

const SOURCE_COLORS: Record<string, string> = {
  MANUAL: "hsl(var(--primary))",
  MCP: "hsl(var(--chart-2, 142 71% 45%))",
  AI_EMBED: "hsl(var(--chart-3, 262 83% 58%))",
  CASCADE: "hsl(var(--chart-4, 24 95% 53%))",
  SCHEDULER: "hsl(var(--chart-5, 43 96% 56%))",
  API: "hsl(200 80% 50%)",
  IMPORT: "hsl(330 80% 60%)",
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  MCP: "MCP",
  AI_EMBED: "AI",
  CASCADE: "Cascade",
  SCHEDULER: "Scheduler",
  API: "API",
  IMPORT: "Import",
};

export function SourceDistributionWidget({ data }: { data: SourceEntry[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Event Sources</CardTitle>
          <CardDescription>Where events originate</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No events yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: SOURCE_LABELS[d.source] ?? d.source,
    value: d.count,
    percentage: d.percentage,
    color: SOURCE_COLORS[d.source] ?? "hsl(var(--muted-foreground))",
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Event Sources</CardTitle>
        <CardDescription>Where task events originate</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                innerRadius={35}
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
                  `${value} events`,
                  String(name),
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
