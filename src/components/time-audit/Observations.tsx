"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Observation } from "@/lib/time-audit/summary";

interface ObservationsProps {
  observations: Observation[];
}

export function Observations({ observations }: ObservationsProps) {
  if (observations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Observations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {observations.map((obs, i) => (
            <li key={i} className="text-sm text-muted-foreground">
              &bull; {obs.text}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
