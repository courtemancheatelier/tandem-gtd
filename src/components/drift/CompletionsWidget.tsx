"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SeriesPoint {
  date: string;
  count: number;
}

interface Props {
  current: SeriesPoint[];
  prior: SeriesPoint[];
}

export function CompletionsWidget({ current, prior }: Props) {
  // Merge current + prior into chart data by index position
  const maxLen = Math.max(current.length, prior.length);
  const data = Array.from({ length: maxLen }, (_, i) => ({
    label: current[i]?.date ?? prior[i]?.date ?? "",
    current: current[i]?.count ?? 0,
    prior: prior[i]?.count ?? 0,
  }));

  const currentTotal = current.reduce((s, p) => s + p.count, 0);
  const priorTotal = prior.reduce((s, p) => s + p.count, 0);
  const trend = priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : 0;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Completions</CardTitle>
          <CardDescription>No completions in this period</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Completions</CardTitle>
        <CardDescription>
          {currentTotal} completed
          {priorTotal > 0 && (
            <span className={trend >= 0 ? "text-green-600 ml-2" : "text-red-500 ml-2"}>
              {trend >= 0 ? "+" : ""}{trend.toFixed(0)}% vs prior
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => {
                  const d = new Date(String(val) + "T00:00:00");
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                className="text-muted-foreground"
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
              <Legend />
              <Bar dataKey="current" fill="hsl(var(--chart-2, 142 71% 45%))" name="Current" radius={[2, 2, 0, 0]} />
              <Bar dataKey="prior" fill="hsl(var(--muted-foreground))" opacity={0.3} name="Prior" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
