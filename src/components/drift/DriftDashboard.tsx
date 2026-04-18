"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpLink } from "@/components/shared/HelpLink";
import { CompletionsWidget } from "./CompletionsWidget";
import { DeferralsWidget } from "./DeferralsWidget";
import { HeatmapWidget } from "./HeatmapWidget";
import { AreaDriftMap } from "./AreaDriftMap";
import { MostDeferredTable } from "./MostDeferredTable";
import { DisplacementLens } from "./DisplacementLens";
import { OutcomeSummary } from "./OutcomeSummary";
import { SleepPerformanceWidget, type SleepPerfData } from "./SleepPerformanceWidget";

type DriftWindow = "this-week" | "last-week" | "this-month" | "ytd";

interface SeriesPoint {
  date: string;
  count: number;
}

interface HeatmapCell {
  dayLabel: string;
  hour: number;
  completions: number;
}

interface AreaDrift {
  id: string;
  name: string;
  driftScore: number;
  driftedTaskCount: number;
  totalDeferrals: number;
  sparkline: number[];
}

interface DriftTask {
  id: string;
  title: string;
  status: string;
  area: string | null;
  project: string | null;
  routine: string | null;
  deferralCount: number;
  dueDatePushCount: number;
  totalDriftDays: number;
  breakdownSignal: boolean;
}

interface FilterOption {
  id: string;
  name: string;
}

type SectionKey =
  | "outcomes"
  | "sleep-performance"
  | "completions-deferrals"
  | "heatmap"
  | "area-drift"
  | "most-deferred"
  | "displacement";

const SECTION_LABELS: Record<SectionKey, string> = {
  outcomes: "Outcome Summary",
  "sleep-performance": "Sleep & Performance",
  "completions-deferrals": "Completions & Deferrals",
  heatmap: "Completion Heatmap",
  "area-drift": "Drift by Area",
  "most-deferred": "Most Deferred",
  displacement: "Displacement Lens",
};

const STORAGE_KEY = "drift-collapsed-sections";

function loadCollapsedSections(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as SectionKey[]);
  } catch {}
  return new Set();
}

function saveCollapsedSections(collapsed: Set<SectionKey>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(collapsed)));
}

export function DriftDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const window = (searchParams.get("window") ?? "this-week") as DriftWindow;
  const areaId = searchParams.get("area") ?? "";
  const goalId = searchParams.get("goal") ?? "";
  const routineId = searchParams.get("routine") ?? "";

  const [loading, setLoading] = useState(true);
  const [areaOptions, setAreaOptions] = useState<FilterOption[]>([]);
  const [goalOptions, setGoalOptions] = useState<FilterOption[]>([]);
  const [routineOptions, setRoutineOptions] = useState<FilterOption[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());

  const [completions, setCompletions] = useState<{ current: SeriesPoint[]; prior: SeriesPoint[] }>({ current: [], prior: [] });
  const [deferrals, setDeferrals] = useState<{ current: SeriesPoint[]; prior: SeriesPoint[] }>({ current: [], prior: [] });
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [heatmapRowLabels, setHeatmapRowLabels] = useState<string[] | undefined>(undefined);
  const [areas, setAreas] = useState<AreaDrift[]>([]);
  const [tasks, setTasks] = useState<DriftTask[]>([]);
  const [outcomes, setOutcomes] = useState<{
    current: { completed: number; skippedDeferred: number; expiredUntouched: number; expiredTasks: { id: string; title: string; area: string | null; scheduledDate: string | null; dueDate: string | null }[] };
    prior: { completed: number; skippedDeferred: number; expiredUntouched: number; expiredTasks: never[] } | null;
  } | null>(null);
  const [sleepPerf, setSleepPerf] = useState<{ current: SleepPerfData | null; prior: SleepPerfData | null } | null>(null);

  // Load collapsed sections from localStorage on mount
  useEffect(() => {
    setCollapsedSections(loadCollapsedSections());
  }, []);

  // Load filter options on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/areas").then((r) => r.json()),
      fetch("/api/goals?status=IN_PROGRESS").then((r) => r.json()),
      fetch("/api/routines").then((r) => r.json()),
    ]).then(([areaData, goalData, routineData]) => {
      setAreaOptions(
        (areaData.areas ?? areaData ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
      );
      setGoalOptions(
        (goalData.goals ?? goalData ?? []).map((g: { id: string; title?: string; name?: string }) => ({
          id: g.id,
          name: g.title ?? g.name ?? "Untitled",
        }))
      );
      const routines = routineData.routines ?? routineData ?? [];
      setRoutineOptions(
        routines
          .filter((r: { isActive?: boolean }) => r.isActive !== false)
          .map((r: { id: string; title: string }) => ({ id: r.id, name: r.title }))
      );
    });
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val) {
          params.set(key, val);
        } else {
          params.delete(key);
        }
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const fetchAll = useCallback(
    async (win: DriftWindow, filterAreaId: string, filterGoalId: string, filterRoutineId: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ window: win });
        if (filterAreaId) params.set("areaId", filterAreaId);
        if (filterGoalId) params.set("goalId", filterGoalId);
        if (filterRoutineId) params.set("routineId", filterRoutineId);
        const qs = `?${params.toString()}`;

        const noWindowParams = new URLSearchParams();
        if (filterAreaId) noWindowParams.set("areaId", filterAreaId);
        if (filterGoalId) noWindowParams.set("goalId", filterGoalId);
        if (filterRoutineId) noWindowParams.set("routineId", filterRoutineId);
        const nwQs = noWindowParams.toString() ? `?${noWindowParams.toString()}` : "";

        const [compRes, defRes, heatRes, areaRes, taskRes, outcomeRes, sleepRes] = await Promise.all([
          fetch(`/api/insights/drift/completions${qs}`).then((r) => r.json()),
          fetch(`/api/insights/drift/deferrals${qs}`).then((r) => r.json()),
          fetch(`/api/insights/drift/heatmap${qs}`).then((r) => r.json()),
          fetch(`/api/insights/drift/by-area${nwQs}`).then((r) => r.json()),
          fetch(`/api/insights/drift/tasks${nwQs}`).then((r) => r.json()),
          fetch(`/api/insights/drift/outcomes${qs}`).then((r) => r.json()),
          fetch(`/api/insights/drift/sleep-performance${qs}`).then((r) => r.json()),
        ]);
        setCompletions({ current: compRes.current ?? [], prior: compRes.prior ?? [] });
        setDeferrals({ current: defRes.current ?? [], prior: defRes.prior ?? [] });
        setHeatmap(heatRes.cells ?? []);
        setHeatmapRowLabels(heatRes.rowLabels);
        setAreas(areaRes.areas ?? []);
        setTasks(taskRes.tasks ?? []);
        setOutcomes({ current: outcomeRes.current, prior: outcomeRes.prior ?? null });
        setSleepPerf(sleepRes.current ? { current: sleepRes.current, prior: sleepRes.prior ?? null } : null);
      } catch (err) {
        console.error("Failed to fetch drift data:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchAll(window, areaId, goalId, routineId);
  }, [window, areaId, goalId, routineId, fetchAll]);

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveCollapsedSections(next);
      return next;
    });
  };

  const hasFilters = areaId || goalId || routineId;

  const handleAreaClick = (clickedAreaId: string) => {
    updateParams({ area: clickedAreaId });
  };

  const clearFilters = () => {
    updateParams({ area: null, goal: null, routine: null });
  };

  function CollapsibleSection({ sectionKey, children }: { sectionKey: SectionKey; children: React.ReactNode }) {
    const isOpen = !collapsedSections.has(sectionKey);
    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleSection(sectionKey)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", !isOpen && "-rotate-90")}
            />
            {SECTION_LABELS[sectionKey]}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Commitment Drift
            <HelpLink slug="commitment-drift" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Track deferral patterns and understand what displaces your commitments.
            Data is linked to the Card File — deferrals are tracked when tasks are skipped or snoozed.
          </p>
        </div>
        <Tabs value={window} onValueChange={(v) => updateParams({ window: v })}>
          <TabsList>
            <TabsTrigger value="this-week">This Week</TabsTrigger>
            <TabsTrigger value="last-week">Last Week</TabsTrigger>
            <TabsTrigger value="this-month">This Month</TabsTrigger>
            <TabsTrigger value="ytd">YTD</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={areaId || "all"} onValueChange={(v) => updateParams({ area: v === "all" ? null : v })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Areas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Areas</SelectItem>
            {areaOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={goalId || "all"} onValueChange={(v) => updateParams({ goal: v === "all" ? null : v })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Goals" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Goals</SelectItem>
            {goalOptions.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={routineId || "all"} onValueChange={(v) => updateParams({ routine: v === "all" ? null : v })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Card Files" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Card Files</SelectItem>
            {routineOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Row 0: Outcome Summary */}
          {outcomes && (
            <CollapsibleSection sectionKey="outcomes">
              <OutcomeSummary current={outcomes.current} prior={outcomes.prior} />
            </CollapsibleSection>
          )}

          {/* Row 0.5: Sleep & Performance */}
          {sleepPerf && (
            <CollapsibleSection sectionKey="sleep-performance">
              <SleepPerformanceWidget current={sleepPerf.current} prior={sleepPerf.prior} />
            </CollapsibleSection>
          )}

          {/* Row 1: Completions + Deferrals side by side */}
          <CollapsibleSection sectionKey="completions-deferrals">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CompletionsWidget current={completions.current} prior={completions.prior} />
              <DeferralsWidget current={deferrals.current} prior={deferrals.prior} />
            </div>
          </CollapsibleSection>

          {/* Row 2: Heatmap */}
          <CollapsibleSection sectionKey="heatmap">
            <HeatmapWidget cells={heatmap} rowLabels={heatmapRowLabels} />
          </CollapsibleSection>

          {/* Row 3: Area Drift Map */}
          <CollapsibleSection sectionKey="area-drift">
            <AreaDriftMap areas={areas} onAreaClick={handleAreaClick} />
          </CollapsibleSection>

          {/* Row 4: Most Deferred Table */}
          <CollapsibleSection sectionKey="most-deferred">
            <MostDeferredTable tasks={tasks} />
          </CollapsibleSection>

          {/* Row 5: Displacement Lens */}
          <CollapsibleSection sectionKey="displacement">
            <DisplacementLens tasks={tasks} />
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
