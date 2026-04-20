"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlignmentScore as AlignmentScoreType } from "@/lib/time-audit/summary";

interface AlignmentScoreProps {
  alignment: AlignmentScoreType;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-muted">
        <div
          className="h-3 rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function AlignmentScore({ alignment }: AlignmentScoreProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">GTD Alignment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBar
          value={alignment.raw}
          label="Time linked to tasks in Tandem"
        />

        <p className="text-xs text-muted-foreground">
          {alignment.taskLinkedIntervals} of {alignment.totalIntervals} intervals
          were linked to a task. That means{" "}
          {100 - alignment.raw}% of your time was spent on things not in your
          system. That&apos;s not necessarily bad &mdash; eating, transit, and
          breaks are part of life.
        </p>

        <ProgressBar
          value={alignment.adjusted}
          label={'Adjusted (excluding maintenance)'}
        />

        <p className="text-xs text-muted-foreground">
          Subtracting life maintenance ({alignment.maintenanceIntervals}{" "}
          intervals of eating, rest, transit, chores), {alignment.adjusted}% of
          your &quot;work&quot; time was in your GTD system. The gap might
          include reactive work not captured, tasks you did but hadn&apos;t
          logged, or time lost to context-switching.
        </p>
      </CardContent>
    </Card>
  );
}
