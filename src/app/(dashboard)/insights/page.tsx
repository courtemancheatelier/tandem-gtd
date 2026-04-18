"use client";

import { useEffect, useState, useCallback } from "react";
import { InsightsGrid } from "@/components/insights/InsightsGrid";
import type { InsightsData } from "@/components/insights/InsightsGrid";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download } from "lucide-react";
import { HelpLink } from "@/components/shared/HelpLink";

const RANGES = ["30d", "90d", "1y", "all"] as const;
type Range = (typeof RANGES)[number];

const RANGE_LABELS: Record<Range, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  all: "All time",
};

export default function InsightsPage() {
  const [range, setRange] = useState<Range>("90d");
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback((r: Range) => {
    setLoading(true);
    setError(null);
    fetch(`/api/insights?range=${r}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load insights");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [range, fetchData]);

  const handleExport = (format: "json" | "csv") => {
    const url = `/api/insights/export?format=${format}&range=${range}`;
    window.location.href = url;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Insights
            <HelpLink slug="what-is-gtd" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Productivity analytics and patterns over time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            value={range}
            onValueChange={(v) => setRange(v as Range)}
          >
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r} value={r} className="text-xs">
                  {RANGE_LABELS[r]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("json")}>
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <div className="p-4">
          <p className="text-sm text-destructive">Error: {error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {data && <InsightsGrid data={data} />}
    </div>
  );
}
