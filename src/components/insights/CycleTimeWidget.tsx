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
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface CycleTimeData {
  trend: { week: string; avgHours: number; count: number }[];
  byContext: { context: string; avgHours: number; count: number }[];
  byEnergy: { energy: string; avgHours: number; count: number }[];
}

export function CycleTimeWidget({ data }: { data: CycleTimeData }) {
  const [tab, setTab] = useState<"trend" | "context" | "energy">("trend");

  if (data.trend.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cycle Time</CardTitle>
          <CardDescription>Time from creation to completion</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No completed tasks yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    fontSize: "12px",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Cycle Time</CardTitle>
            <CardDescription>Avg hours from creation to completion</CardDescription>
          </div>
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="mt-2"
        >
          <TabsList className="h-7">
            <TabsTrigger value="trend" className="text-xs px-2 h-6">
              Trend
            </TabsTrigger>
            <TabsTrigger value="context" className="text-xs px-2 h-6">
              Context
            </TabsTrigger>
            <TabsTrigger value="energy" className="text-xs px-2 h-6">
              Energy
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            {tab === "trend" ? (
              <LineChart data={data.trend}>
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
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => {
                    const d = new Date(String(label) + "T00:00:00");
                    return `Week of ${d.toLocaleDateString()}`;
                  }}
                  formatter={(value) => [`${value}h`, "Avg cycle time"]}
                />
                <Line
                  type="monotone"
                  dataKey="avgHours"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            ) : tab === "context" ? (
              <BarChart data={data.byContext} layout="vertical">
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
                  dataKey="context"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  width={80}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value}h`, "Avg cycle time"]}
                />
                <Bar
                  dataKey="avgHours"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            ) : (
              <BarChart data={data.byEnergy} layout="vertical">
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
                  dataKey="energy"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  width={80}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value}h`, "Avg cycle time"]}
                />
                <Bar
                  dataKey="avgHours"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
