"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeAuditSummary } from "@/lib/time-audit/summary";
import { TimeDistributionChart } from "./TimeDistributionChart";
import { AlignmentScore } from "./AlignmentScore";
import { EnergyMap } from "./EnergyMap";
import { Observations } from "./Observations";

interface ChallengeSummaryProps {
  summary: TimeAuditSummary;
}

export function ChallengeSummary({ summary }: ChallengeSummaryProps) {
  const hours = Math.floor(summary.loggedMinutes / 60);
  const mins = summary.loggedMinutes % 60;

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-2xl font-bold">
                {hours}h {mins}m
              </p>
              <p className="text-xs text-muted-foreground">Time logged</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.loggedIntervals}</p>
              <p className="text-xs text-muted-foreground">
                of {summary.totalIntervals} intervals
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.completionPercent}%</p>
              <p className="text-xs text-muted-foreground">Completion</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {summary.tagDistribution.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Different activities
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time distribution chart */}
      <TimeDistributionChart distribution={summary.tagDistribution} />

      {/* Alignment score */}
      <AlignmentScore alignment={summary.alignment} />

      {/* Energy map */}
      <EnergyMap energyMap={summary.energyMap} />

      {/* Observations */}
      <Observations observations={summary.observations} />
    </div>
  );
}
