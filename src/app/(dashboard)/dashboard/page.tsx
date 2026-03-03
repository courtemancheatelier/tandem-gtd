"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import type { DashboardStatsResponse } from "@/components/dashboard/DashboardGrid";
import { HelpLink } from "@/components/shared/HelpLink";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [velocityWeeks, setVelocityWeeks] = useState(12);

  const fetchData = useCallback((vWeeks: number) => {
    fetch(`/api/dashboard/stats?velocityWeeks=${vWeeks}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchData(velocityWeeks);
  }, [fetchData, velocityWeeks]);

  const handleVelocityLookbackChange = useCallback((weeks: number) => {
    setVelocityWeeks(weeks);
  }, []);

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Dashboard
          <HelpLink slug="project-burn-down" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Project overview and health indicators
        </p>
      </div>
      <DashboardGrid data={data} onVelocityLookbackChange={handleVelocityLookbackChange} />
    </div>
  );
}
