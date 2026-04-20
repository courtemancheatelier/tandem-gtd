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
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ContextEntry {
  context: string;
  count: number;
}

interface EnergyEntry {
  energy: string;
  count: number;
}

const ENERGY_COLORS: Record<string, string> = {
  LOW: "hsl(var(--chart-2, 142 71% 45%))",
  MEDIUM: "hsl(var(--chart-4, 24 95% 53%))",
  HIGH: "hsl(var(--destructive, 0 84% 60%))",
  None: "hsl(var(--muted-foreground))",
};

export function ContextEnergyWidget({
  contextData,
  energyData,
}: {
  contextData: ContextEntry[];
  energyData: EnergyEntry[];
}) {
  const hasData = contextData.length > 0 || energyData.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Completions Breakdown</CardTitle>
          <CardDescription>By context and energy level</CardDescription>
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

  const energyChartData = energyData.map((d) => ({
    ...d,
    fill: ENERGY_COLORS[d.energy] ?? "hsl(var(--primary))",
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Completions Breakdown</CardTitle>
        <CardDescription>By context and energy level</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {/* Context chart */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              By Context
            </p>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contextData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="context"
                    tick={{ fontSize: 9 }}
                    className="text-muted-foreground"
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    name="Completed"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Energy chart */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              By Energy
            </p>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={energyChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="energy"
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    name="Completed"
                  >
                    {energyChartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.fill}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
