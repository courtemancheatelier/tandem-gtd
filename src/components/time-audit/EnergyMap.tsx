"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type TagCategory,
} from "@/lib/time-audit/constants";
import type { EnergyMapBucket } from "@/lib/time-audit/summary";

interface EnergyMapProps {
  energyMap: EnergyMapBucket[];
}

const CATEGORIES: TagCategory[] = [
  "productive",
  "reactive",
  "maintenance",
  "untracked",
];

export function EnergyMap({ energyMap }: EnergyMapProps) {
  if (energyMap.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Energy Pattern</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data to display</p>
        </CardContent>
      </Card>
    );
  }

  // Find max for scaling
  const maxTotal = Math.max(
    ...energyMap.map((b) =>
      CATEGORIES.reduce((sum, cat) => sum + b.categories[cat], 0)
    ),
    1
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Energy Pattern</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Horizontal stacked bars per hour */}
        <div className="space-y-1">
          {energyMap.map((bucket) => {
            const total = CATEGORIES.reduce(
              (sum, cat) => sum + bucket.categories[cat],
              0
            );
            return (
              <div key={bucket.hour} className="flex items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground text-right shrink-0">
                  {bucket.label}
                </span>
                <div className="flex-1 flex h-5 rounded overflow-hidden bg-muted">
                  {CATEGORIES.map((cat) => {
                    const count = bucket.categories[cat];
                    if (count === 0) return null;
                    const pct = (count / maxTotal) * 100;
                    return (
                      <div
                        key={cat}
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CATEGORY_COLORS[cat],
                        }}
                        title={`${CATEGORY_LABELS[cat]}: ${count}`}
                      />
                    );
                  })}
                </div>
                <span className="w-6 text-xs text-muted-foreground shrink-0">
                  {total}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5 text-xs">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: CATEGORY_COLORS[cat] }}
              />
              <span className="text-muted-foreground">
                {CATEGORY_LABELS[cat]}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
