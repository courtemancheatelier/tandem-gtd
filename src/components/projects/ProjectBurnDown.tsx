"use client";

import { useState, useCallback, useRef } from "react";
import { ChevronRight, TrendingDown, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BurnDownWidget } from "@/components/dashboard/BurnDownWidget";
import type { BurnDownData, VelocityData } from "@/components/dashboard/BurnDownWidget";
import { BurnUpChart } from "@/components/dashboard/BurnUpChart";
import type { BurnUpResponse } from "@/components/dashboard/BurnUpChart";
import { ProjectVelocityChart } from "@/components/projects/ProjectVelocityChart";
import type { ProjectVelocityResponse } from "@/components/projects/ProjectVelocityChart";

interface ProjectBurnDownProps {
  projectId: string;
  projectTitle?: string;
  velocityUnit?: "AUTO" | "TASKS" | "HOURS";
}

type UnitSetting = "auto" | "tasks" | "hours";
type ChartMode = "burn-down" | "burn-up" | "velocity";

function settingFromProp(prop?: "AUTO" | "TASKS" | "HOURS"): UnitSetting {
  if (prop === "TASKS") return "tasks";
  if (prop === "HOURS") return "hours";
  return "auto";
}

/** Always pass unit explicitly so fetch doesn't depend on PATCH completing */
function unitParam(setting: UnitSetting): string {
  return `?unit=${setting}`;
}

export function ProjectBurnDown({ projectId, velocityUnit }: ProjectBurnDownProps) {
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const [chartMode, setChartMode] = useState<ChartMode>("burn-down");
  const [unitSetting, setUnitSetting] = useState<UnitSetting>(() => settingFromProp(velocityUnit));

  // Burn-down state
  const [data, setData] = useState<{ burnDown: BurnDownData; velocity: VelocityData; warnings: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedSetting = useRef<UnitSetting | null>(null);

  // Burn-up state
  const [burnUpData, setBurnUpData] = useState<BurnUpResponse | null>(null);
  const [burnUpLoading, setBurnUpLoading] = useState(false);
  const [burnUpError, setBurnUpError] = useState(false);
  const burnUpFetchedSetting = useRef<UnitSetting | null>(null);

  // Velocity state
  const [velocityData, setVelocityData] = useState<ProjectVelocityResponse | null>(null);
  const [velocityLoading, setVelocityLoading] = useState(false);
  const [velocityError, setVelocityError] = useState(false);
  const velocityFetchedSetting = useRef<UnitSetting | null>(null);

  const fetchBurnDown = useCallback(async (setting: UnitSetting) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/burn-down${unitParam(setting)}`);
      if (res.ok) {
        setData(await res.json());
        fetchedSetting.current = setting;
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchBurnUp = useCallback(async (setting: UnitSetting) => {
    setBurnUpLoading(true);
    setBurnUpError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/burn-up${unitParam(setting)}`);
      if (res.ok) {
        setBurnUpData(await res.json());
        burnUpFetchedSetting.current = setting;
      } else {
        setBurnUpError(true);
      }
    } catch {
      setBurnUpError(true);
    } finally {
      setBurnUpLoading(false);
    }
  }, [projectId]);

  const fetchVelocity = useCallback(async (setting: UnitSetting) => {
    setVelocityLoading(true);
    setVelocityError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/velocity${unitParam(setting)}`);
      if (res.ok) {
        setVelocityData(await res.json());
        velocityFetchedSetting.current = setting;
      } else {
        setVelocityError(true);
      }
    } catch {
      setVelocityError(true);
    } finally {
      setVelocityLoading(false);
    }
  }, [projectId]);

  /** Silently refresh without loading spinner */
  const refreshData = useCallback(async () => {
    const s = fetchedSetting.current ?? "auto";
    try {
      if (chartMode === "burn-down") {
        const res = await fetch(`/api/projects/${projectId}/burn-down${unitParam(s)}`);
        if (res.ok) setData(await res.json());
      }
      if (burnUpFetchedSetting.current != null) {
        const res = await fetch(`/api/projects/${projectId}/burn-up${unitParam(burnUpFetchedSetting.current)}`);
        if (res.ok) setBurnUpData(await res.json());
      }
      if (velocityFetchedSetting.current != null) {
        const res = await fetch(`/api/projects/${projectId}/velocity${unitParam(velocityFetchedSetting.current)}`);
        if (res.ok) setVelocityData(await res.json());
      }
    } catch {
      // silent — keep showing stale data
    }
  }, [projectId, chartMode]);

  function handleToggle() {
    const willExpand = !expanded;
    setExpanded(willExpand);
    expandedRef.current = willExpand;
    if (willExpand) {
      if (chartMode === "burn-down" && fetchedSetting.current !== unitSetting) {
        fetchBurnDown(unitSetting);
      } else if (chartMode === "burn-up" && burnUpFetchedSetting.current !== unitSetting) {
        fetchBurnUp(unitSetting);
      } else if (chartMode === "velocity" && velocityFetchedSetting.current !== unitSetting) {
        fetchVelocity(unitSetting);
      }
    }
  }

  function handleUnitChange(newSetting: UnitSetting) {
    if (newSetting === unitSetting) return;
    setUnitSetting(newSetting);

    // Persist to project
    const dbValue = newSetting === "auto" ? "AUTO" : newSetting === "hours" ? "HOURS" : "TASKS";
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ velocityUnit: dbValue }),
    }).catch(() => {});

    if (!expanded) return;
    if (chartMode === "burn-down") {
      fetchBurnDown(newSetting);
    } else if (chartMode === "burn-up") {
      fetchBurnUp(newSetting);
    } else {
      fetchVelocity(newSetting);
    }
  }

  function handleChartModeChange(mode: ChartMode) {
    if (mode === chartMode) return;
    setChartMode(mode);
    if (!expanded) return;
    if (mode === "burn-down" && fetchedSetting.current !== unitSetting) {
      fetchBurnDown(unitSetting);
    } else if (mode === "burn-up" && burnUpFetchedSetting.current !== unitSetting) {
      fetchBurnUp(unitSetting);
    } else if (mode === "velocity" && velocityFetchedSetting.current !== unitSetting) {
      fetchVelocity(unitSetting);
    }
  }

  // Expose refresh for parent components
  if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[`__burndown_refresh_${projectId}`] = () => {
      if (expandedRef.current) refreshData();
    };
  }

  const activeWarnings =
    chartMode === "burn-down"
      ? data?.warnings ?? []
      : chartMode === "burn-up"
        ? burnUpData?.warnings ?? []
        : velocityData?.warnings ?? [];
  const isLoading =
    chartMode === "burn-down"
      ? loading
      : chartMode === "burn-up"
        ? burnUpLoading
        : velocityLoading;
  const isError =
    chartMode === "burn-down"
      ? error
      : chartMode === "burn-up"
        ? burnUpError
        : velocityError;

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
          <TrendingDown className="h-4 w-4" />
          Charts
        </button>

        {expanded && (
          <>
            {/* Chart mode toggle */}
            <div className="flex items-center rounded-md border text-xs">
              <button
                onClick={() => handleChartModeChange("burn-down")}
                className={cn(
                  "px-2 py-0.5 rounded-l-md transition-colors",
                  chartMode === "burn-down"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                ▼ Burn-Down
              </button>
              <button
                onClick={() => handleChartModeChange("burn-up")}
                className={cn(
                  "px-2 py-0.5 transition-colors",
                  chartMode === "burn-up"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                △ Burn-Up
              </button>
              <button
                onClick={() => handleChartModeChange("velocity")}
                className={cn(
                  "px-2 py-0.5 rounded-r-md transition-colors",
                  chartMode === "velocity"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                ⚡ Velocity
              </button>
            </div>

            {/* Unit toggle */}
            <div className="flex items-center rounded-md border text-xs">
              <button
                onClick={() => handleUnitChange("auto")}
                className={cn(
                  "px-2 py-0.5 rounded-l-md transition-colors",
                  unitSetting === "auto"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                Auto
              </button>
              <button
                onClick={() => handleUnitChange("tasks")}
                className={cn(
                  "px-2 py-0.5 transition-colors",
                  unitSetting === "tasks"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                Tasks
              </button>
              <button
                onClick={() => handleUnitChange("hours")}
                className={cn(
                  "px-2 py-0.5 rounded-r-md transition-colors",
                  unitSetting === "hours"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                Hours
              </button>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="mt-3">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {isError && (
            <p className="text-sm text-muted-foreground py-4">
              Failed to load chart data.
            </p>
          )}

          {/* Warnings */}
          {!isLoading && activeWarnings.length > 0 && (
            <div className="mb-3 space-y-1">
              {activeWarnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-2.5 py-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Burn-Down chart */}
          {chartMode === "burn-down" && data && !loading && (
            <BurnDownWidget
              data={data.burnDown}
              velocity={data.velocity}
              title="Burn-Down"
              compact
            />
          )}

          {/* Burn-Up chart */}
          {chartMode === "burn-up" && burnUpData && !burnUpLoading && (
            <BurnUpChart
              data={burnUpData}
              title="Burn-Up"
              compact
            />
          )}

          {/* Velocity chart */}
          {chartMode === "velocity" && velocityData && !velocityLoading && (
            <ProjectVelocityChart
              data={velocityData}
              title="Velocity"
              compact
            />
          )}
        </div>
      )}
    </div>
  );
}
