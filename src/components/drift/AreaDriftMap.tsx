"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface AreaDrift {
  id: string;
  name: string;
  driftScore: number;
  driftedTaskCount: number;
  totalDeferrals: number;
  sparkline: number[];
}

interface Props {
  areas: AreaDrift[];
  onAreaClick?: (areaId: string) => void;
}

function getScoreColor(score: number): string {
  if (score === 0) return "text-muted-foreground";
  if (score < 25) return "text-amber-500";
  if (score < 50) return "text-orange-500";
  return "text-red-500";
}

function getScoreBg(score: number): string {
  if (score === 0) return "border-border";
  if (score < 25) return "border-amber-200 dark:border-amber-800";
  if (score < 50) return "border-orange-200 dark:border-orange-800";
  return "border-red-200 dark:border-red-800";
}

function getSparklineColor(score: number): string {
  if (score === 0) return "hsl(var(--muted-foreground))";
  if (score < 25) return "#f59e0b";
  if (score < 50) return "#f97316";
  return "#ef4444";
}

export function AreaDriftMap({ areas, onAreaClick }: Props) {
  if (areas.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Drift by Area</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No areas with drift data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Drift by Area</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {areas.map((area) => {
            const sparkData = area.sparkline.map((val, i) => ({ week: i, count: val }));
            return (
              <button
                type="button"
                key={area.id}
                onClick={() => onAreaClick?.(area.id)}
                className={cn(
                  "rounded-lg border p-3 space-y-2 text-left w-full transition-colors",
                  getScoreBg(area.driftScore),
                  onAreaClick && "hover:bg-muted/50 cursor-pointer"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{area.name}</span>
                  <span className={cn("text-lg font-bold tabular-nums", getScoreColor(area.driftScore))}>
                    {area.driftScore}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {area.driftedTaskCount} drifted task{area.driftedTaskCount !== 1 ? "s" : ""}
                </div>
                <div className="h-[30px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData}>
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke={getSparklineColor(area.driftScore)}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
