"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface InboxThroughputEntry {
  week: string;
  captured: number;
  processed: number;
}

export function InboxThroughputWidget({
  data,
}: {
  data: InboxThroughputEntry[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inbox Throughput</CardTitle>
          <CardDescription>Captured vs processed per week</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No inbox events yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inbox Throughput</CardTitle>
        <CardDescription>Captured vs processed items per week</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
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
                labelFormatter={(label) => {
                  const d = new Date(String(label) + "T00:00:00");
                  return `Week of ${d.toLocaleDateString()}`;
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="captured"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="Captured"
              />
              <Line
                type="monotone"
                dataKey="processed"
                stroke="hsl(var(--chart-2, 142 71% 45%))"
                strokeWidth={2}
                dot={false}
                name="Processed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
