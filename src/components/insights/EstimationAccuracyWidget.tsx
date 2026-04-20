"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

interface EstimationAccuracyData {
  totalTasks: number;
  avgRatio: number;
  medianRatio: number;
  distribution: { label: string; count: number; isAccurate: boolean }[];
  weeklyTrend: { week: string; avgRatio: number; taskCount: number }[];
  byEnergy: { energy: string; avgRatio: number; count: number }[];
  byEstimateSize: { label: string; avgRatio: number; count: number }[];
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
};

function getAccuracyPercent(ratio: number): number {
  // How close to 1.0 — expressed as a percentage
  // 1.0 = 100%, 0.5 = 50%, 2.0 = 50%
  if (ratio <= 1) return Math.round(ratio * 100);
  return Math.round((1 / ratio) * 100);
}

function getAccuracyColor(ratio: number): string {
  const pct = getAccuracyPercent(ratio);
  if (pct >= 75) return "hsl(var(--chart-2))"; // green
  if (pct >= 50) return "hsl(var(--chart-4))"; // amber
  return "hsl(var(--destructive))"; // red
}

function RatioBar({ data }: { data: EstimationAccuracyData["byEstimateSize"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          domain={[0, (dataMax: number) => Math.max(1.1, dataMax + 0.1)]}
          tickFormatter={(v) => `${Math.round(v * 100)}%`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          width={90}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [
            `${Math.round(Number(value) * 100)}% of estimate`,
            "Avg actual",
          ]}
        />
        <ReferenceLine x={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
        <Bar dataKey="avgRatio" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={getAccuracyColor(entry.avgRatio)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EstimationAccuracyWidget({
  data,
}: {
  data: EstimationAccuracyData;
}) {
  const [tab, setTab] = useState<"distribution" | "trend" | "size">(
    "distribution"
  );

  const accuracyPct = getAccuracyPercent(data.medianRatio);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Estimation Accuracy</CardTitle>
            <CardDescription>
              How close your time estimates match actual time
            </CardDescription>
          </div>
          <div className="text-right">
            <div
              className="text-2xl font-bold"
              style={{ color: getAccuracyColor(data.medianRatio) }}
            >
              {accuracyPct}%
            </div>
            <div className="text-xs text-muted-foreground">
              {data.totalTasks} {data.totalTasks === 1 ? "task" : "tasks"}
            </div>
          </div>
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="mt-2"
        >
          <TabsList className="h-7">
            <TabsTrigger value="distribution" className="text-xs px-2 h-6">
              Distribution
            </TabsTrigger>
            <TabsTrigger value="trend" className="text-xs px-2 h-6">
              Trend
            </TabsTrigger>
            <TabsTrigger value="size" className="text-xs px-2 h-6">
              By Size
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          {tab === "distribution" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  width={80}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value} tasks`, "Count"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.distribution.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.isAccurate
                          ? "hsl(var(--chart-2))"
                          : "hsl(var(--chart-4))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : tab === "trend" ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyTrend}>
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
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => {
                    const d = new Date(String(label) + "T00:00:00");
                    return `Week of ${d.toLocaleDateString()}`;
                  }}
                  formatter={(value, _name, props) => [
                    `${Math.round(Number(value) * 100)}% of estimate (${(props as { payload: { taskCount: number } }).payload.taskCount} tasks)`,
                    "Avg actual",
                  ]}
                />
                <ReferenceLine
                  y={1}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  label={{ value: "Perfect", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="avgRatio"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <RatioBar data={data.byEstimateSize} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
