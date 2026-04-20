"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HeatmapCell {
  dayLabel: string;
  hour: number;
  completions: number;
}

interface Props {
  cells: HeatmapCell[];
  rowLabels?: string[];
}

const HOUR_LABELS = [
  "12a", "2a", "4a", "6a", "8a", "10a",
  "12p", "2p", "4p", "6p", "8p", "10p",
];

function getIntensity(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-muted";
  const ratio = value / max;
  if (ratio < 0.25) return "bg-blue-200 dark:bg-blue-900";
  if (ratio < 0.5) return "bg-blue-400 dark:bg-blue-700";
  if (ratio < 0.75) return "bg-blue-500 dark:bg-blue-500";
  return "bg-blue-700 dark:bg-blue-300";
}

function getTextColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "text-muted-foreground/50";
  const ratio = value / max;
  if (ratio < 0.5) return "text-blue-900 dark:text-blue-100";
  return "text-white dark:text-blue-950";
}

const LEGEND_STEPS = [
  { label: "0", className: "bg-muted" },
  { label: "Low", className: "bg-blue-200 dark:bg-blue-900" },
  { label: "", className: "bg-blue-400 dark:bg-blue-700" },
  { label: "", className: "bg-blue-500 dark:bg-blue-500" },
  { label: "High", className: "bg-blue-700 dark:bg-blue-300" },
];

export function HeatmapWidget({ cells, rowLabels }: Props) {
  const maxVal = Math.max(...cells.map((c) => c.completions), 1);

  // Build lookup for quick access
  const lookup = new Map<string, number>();
  for (const c of cells) {
    lookup.set(`${c.dayLabel}:${c.hour}`, c.completions);
  }

  const totalCompletions = cells.reduce((s, c) => s + c.completions, 0);

  // Derive row labels from cells if not provided
  const labels = rowLabels ?? Array.from(new Set(cells.map((c) => c.dayLabel)));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Completion Heatmap</CardTitle>
        <CardDescription>When you get things done</CardDescription>
      </CardHeader>
      <CardContent>
        {totalCompletions === 0 ? (
          <p className="text-sm text-muted-foreground">No completions in this period</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Hour labels */}
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `48px repeat(12, 1fr)` }}>
              <div />
              {HOUR_LABELS.map((h) => (
                <div key={h} className="text-[10px] text-muted-foreground text-center">{h}</div>
              ))}
            </div>
            {/* Row per day/date/month */}
            {labels.map((label) => (
              <div
                key={label}
                className="grid gap-0.5 mt-0.5"
                style={{ gridTemplateColumns: `48px repeat(12, 1fr)` }}
              >
                <div className="text-[11px] text-muted-foreground flex items-center truncate">{label}</div>
                {Array.from({ length: 12 }, (_, i) => {
                  const hour = i * 2;
                  const val = lookup.get(`${label}:${hour}`) ?? 0;
                  return (
                    <div
                      key={hour}
                      className={cn(
                        "aspect-square rounded-sm min-h-[18px] transition-colors flex items-center justify-center",
                        getIntensity(val, maxVal)
                      )}
                      title={`${label} ${HOUR_LABELS[i]}: ${val} completion${val !== 1 ? "s" : ""}`}
                    >
                      {val > 0 && (
                        <span className={cn("text-[9px] font-medium leading-none", getTextColor(val, maxVal))}>
                          {val}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-end gap-1 mt-3">
              <span className="text-[10px] text-muted-foreground mr-1">Less</span>
              {LEGEND_STEPS.map((step, i) => (
                <div
                  key={i}
                  className={cn("h-3.5 w-3.5 rounded-sm", step.className)}
                />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
