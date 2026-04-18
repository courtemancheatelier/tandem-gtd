"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TaskCard } from "@/components/tasks/TaskCard";
import { RoutineCard, type RoutineCardTask } from "@/components/recurring/RoutineCard";
import { FilterBar } from "@/components/tasks/FilterBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Zap, Clock, Loader2, CalendarDays, Timer } from "lucide-react";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { useOnboardingCheck } from "@/lib/hooks/use-onboarding-check";
import { useSelection } from "@/lib/hooks/use-selection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { HelpLink } from "@/components/shared/HelpLink";
import { useUndo } from "@/contexts/UndoContext";
import { BottomFilterTray } from "@/components/layout/BottomFilterTray";
import { useSession } from "next-auth/react";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/shared/PullToRefreshIndicator";
import { PendingDecisionItem } from "@/components/decisions/PendingDecisionItem";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { ThreadMentionItem } from "@/components/threads/ThreadMentionItem";
import { ActualTimePrompt } from "@/components/tasks/ActualTimePrompt";
import { useTimer } from "@/contexts/TimerContext";
import { Vote, MessageSquare, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveFilters, getInitialFilters, clearFilters } from "@/lib/hooks/use-persisted-filters";

interface CalendarEventData {
  id: string;
  title: string;
  eventType: string;
  startTime?: string | null;
  endTime?: string | null;
}

interface TaskData {
  id: string;
  title: string;
  notes?: string | null;
  status: string;
  isNextAction: boolean;
  estimatedMins?: number | null;
  actualMinutes?: number | null;
  energyLevel?: string | null;
  dueDate?: string | null;
  scheduledDate?: string | null;
  externalLinkUrl?: string | null;
  externalLinkLabel?: string | null;
  routineId?: string | null;
  routine?: {
    id: string;
    color?: string | null;
    estimatedMins?: number | null;
    scheduleLabel: string;
    routineType?: string;
    dayNumber?: number | null;
    totalDays?: number | null;
    windows: {
      id: string;
      title: string;
      targetTime?: string | null;
      sortOrder: number;
      constraint?: string | null;
      items: { id: string; name: string; dosage?: string | null; form?: string | null; notes?: string | null; dosageChanged?: boolean }[];
      log?: { id: string; status: string; reason?: string | null; itemsTaken?: string[] | null } | null;
    }[];
  } | null;
  version: number;
  project?: { id: string; title: string; type: string; completionNotesEnabled?: boolean; team?: { id: string; name: string; icon?: string | null } | null; parentProject?: { id: string; title: string; parentProject?: { id: string; title: string } | null } | null } | null;
  context?: { id: string; name: string; color: string | null } | null;
}

interface WaitingForData {
  id: string;
  description: string;
  person: string;
  dueDate?: string | null;
}

interface ContextData {
  id: string;
  name: string;
  color: string | null;
}

interface TeamData {
  id: string;
  name: string;
  icon?: string | null;
}

function CalendarBanner({ events }: { events: CalendarEventData[] }) {
  if (events.length === 0) return null;

  const now = new Date();

  // Find active time block (startTime <= now <= endTime)
  const activeTimeBlock = events.find((e) => {
    if (e.eventType !== "TIME_BLOCK" || !e.startTime || !e.endTime) return false;
    const start = new Date(e.startTime);
    const end = new Date(e.endTime);
    return start <= now && now <= end;
  });

  // Find next upcoming timed event
  const upcomingEvents = events
    .filter((e) => e.startTime && new Date(e.startTime) > now && (e.eventType === "TIME_SPECIFIC" || e.eventType === "TIME_BLOCK"))
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
  const nextEvent = upcomingEvents[0];

  if (!activeTimeBlock && !nextEvent) return null;

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function minutesUntil(dateStr: string): number {
    return Math.round((new Date(dateStr).getTime() - now.getTime()) / 60000);
  }

  function formatMinutesUntil(mins: number): string {
    if (mins < 1) return "now";
    if (mins < 60) return `in ${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  }

  return (
    <div className="space-y-2">
      {activeTimeBlock && activeTimeBlock.endTime && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2 text-sm">
          <Timer className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
          <span>
            <span className="font-medium">Currently scheduled:</span>{" "}
            {activeTimeBlock.title} (until {formatTime(activeTimeBlock.endTime)})
          </span>
        </div>
      )}
      {nextEvent && nextEvent.startTime && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-2 text-sm">
          <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>
            <span className="font-medium">Next:</span>{" "}
            {nextEvent.title} at {formatTime(nextEvent.startTime)}{" "}
            ({formatMinutesUntil(minutesUntil(nextEvent.startTime))})
          </span>
        </div>
      )}
    </div>
  );
}

const DO_NOW_FILTER_KEYS = ["context", "energy", "maxTime", "due", "scope", "status", "project", "source", "sort"];

function DoNowContent() {
  const { toast } = useToast();
  const { push: pushUndo } = useUndo();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { shouldOnboard, checking: checkingOnboarding } = useOnboardingCheck();

  useEffect(() => {
    if (!checkingOnboarding && shouldOnboard) {
      router.replace("/onboarding");
    }
  }, [checkingOnboarding, shouldOnboard, router]);

  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [waitingFor, setWaitingFor] = useState<WaitingForData[]>([]);
  const [dueSoon, setDueSoon] = useState<TaskData[]>([]);
  const [contexts, setContexts] = useState<ContextData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingDecisions, setPendingDecisions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [threadMentions, setThreadMentions] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventData[]>([]);
  const [expandedDecisionId, setExpandedDecisionId] = useState<string | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession();

  // Read initial filter values from URL search params, falling back to localStorage
  const savedFilters = getInitialFilters("do-now", searchParams, DO_NOW_FILTER_KEYS);

  const urlContext = searchParams.get("context") ?? savedFilters?.context ?? null;
  const urlEnergy = searchParams.get("energy") ?? savedFilters?.energy ?? null;
  const urlMaxTime = searchParams.get("maxTime") ?? savedFilters?.maxTime ?? null;
  const urlDue = searchParams.get("due") ?? savedFilters?.due ?? null;
  const urlScope = searchParams.get("scope") ?? savedFilters?.scope ?? null;
  const urlStatus = searchParams.get("status") ?? savedFilters?.status ?? null;
  const urlProject = searchParams.get("project") ?? savedFilters?.project ?? null;
  const urlSource = searchParams.get("source") ?? savedFilters?.source ?? null;
  const urlSort = searchParams.get("sort") ?? savedFilters?.sort ?? null;

  // Filter state — synced from URL search params whenever they change
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(urlEnergy || null);
  const [selectedMaxMins, setSelectedMaxMins] = useState<number | null>(
    urlMaxTime ? parseInt(urlMaxTime, 10) : null
  );
  const [selectedDue, setSelectedDue] = useState<string[]>(urlDue ? urlDue.split(",") : []);
  const [selectedScope, setSelectedScope] = useState<string | null>(urlScope || null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(urlStatus || null);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(urlProject || null);
  const [selectedSource, setSelectedSource] = useState<string | null>(urlSource || null);
  const [selectedSort, setSelectedSort] = useState<string | null>(urlSort || null);
  const timer = useTimer();
  const [actualTimePrompt, setActualTimePrompt] = useState<{
    taskId: string;
    estimatedMins: number;
    prefillMinutes?: number;
    timerSource?: boolean;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const [tasksRes, contextsRes, teamsRes, decisionsRes, mentionsRes, calendarRes] = await Promise.all([
        fetch("/api/tasks/available"),
        fetch("/api/contexts"),
        fetch("/api/teams"),
        fetch("/api/decisions/pending"),
        fetch("/api/threads/mentions"),
        fetch(`/api/calendar?start=${todayStart.toISOString()}&end=${todayEnd.toISOString()}`),
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.doNow);
        setWaitingFor(data.waitingFor);
        setDueSoon(data.dueSoon);
      }

      if (contextsRes.ok) {
        setContexts(await contextsRes.json());
      }

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(teamsData.teams || []);
      }

      if (decisionsRes.ok) {
        setPendingDecisions(await decisionsRes.json());
      }

      if (mentionsRes.ok) {
        setThreadMentions(await mentionsRes.json());
      }

      if (calendarRes.ok) {
        setCalendarEvents(await calendarRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync non-context filters from URL immediately (no dependency on contexts loading)
  useEffect(() => {
    setSelectedEnergy(urlEnergy || null);
    setSelectedMaxMins(urlMaxTime ? parseInt(urlMaxTime, 10) : null);
    setSelectedDue(urlDue ? urlDue.split(",") : []);
    setSelectedScope(urlScope || null);
    setSelectedStatus(urlStatus || null);
    setSelectedProjectFilter(urlProject || null);
    setSelectedSource(urlSource || null);
    setSelectedSort(urlSort || null);
  }, [urlEnergy, urlMaxTime, urlDue, urlScope, urlStatus, urlProject, urlSource, urlSort]);

  // Sync context filter only once contexts are loaded (needs name→id mapping)
  useEffect(() => {
    if (contexts.length === 0) return;
    if (urlContext) {
      const names = urlContext.split(",");
      const ids = names
        .map((name) => contexts.find((c) => c.name.toLowerCase() === name.trim().toLowerCase()))
        .filter((c): c is ContextData => c != null)
        .map((c) => c.id);
      setSelectedContextIds(ids);
    } else {
      setSelectedContextIds([]);
    }
  }, [contexts, urlContext]);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    // Build context names for storage (same format as URL)
    const contextNames = selectedContextIds
      .map((id) => contexts.find((c) => c.id === id)?.name)
      .filter((n): n is string => n != null)
      .join(",");
    saveFilters("do-now", {
      context: contextNames || null,
      energy: selectedEnergy,
      maxTime: selectedMaxMins?.toString() ?? null,
      due: selectedDue.length > 0 ? selectedDue.join(",") : null,
      scope: selectedScope,
      status: selectedStatus,
      project: selectedProjectFilter,
      source: selectedSource,
      sort: selectedSort,
    });
  }, [selectedContextIds, selectedEnergy, selectedMaxMins, selectedDue, selectedScope, selectedStatus, selectedProjectFilter, selectedSource, selectedSort, contexts]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update URL when filters change so QuickView sidebar stays in sync
  function handleContextChange(contextIds: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (contextIds.length > 0) {
      const names = contextIds
        .map((id) => contexts.find((c) => c.id === id)?.name)
        .filter((n): n is string => n != null);
      params.set("context", names.join(","));
    } else {
      params.delete("context");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleEnergyChange(energy: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (energy) params.set("energy", energy);
    else params.delete("energy");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleMaxMinsChange(mins: number | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (mins) params.set("maxTime", mins.toString());
    else params.delete("maxTime");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleDueChange(due: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (due.length > 0) params.set("due", due.join(","));
    else params.delete("due");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleScopeChange(scope: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (scope) params.set("scope", scope);
    else params.delete("scope");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleStatusFilterChange(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set("status", status);
    else params.delete("status");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleProjectFilterChange(filter: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter) params.set("project", filter);
    else params.delete("project");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleSourceChange(source: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (source) params.set("source", source);
    else params.delete("source");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleSortChange(sort: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (sort) params.set("sort", sort);
    else params.delete("sort");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleClearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("context");
    params.delete("energy");
    params.delete("maxTime");
    params.delete("due");
    params.delete("scope");
    params.delete("status");
    params.delete("project");
    params.delete("source");
    params.delete("sort");
    clearFilters("do-now");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    // Optimistic update
    const task = [...tasks, ...dueSoon].find((t) => t.id === taskId);
    const applyStatus = (t: TaskData): TaskData =>
      t.id === taskId ? { ...t, status: newStatus } : t;
    setTasks((prev) => prev.map(applyStatus));
    setDueSoon((prev) => prev.map(applyStatus));

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status: newStatus, version: task?.version }),
    });
    if (res.status === 409) {
      // Auto-retry with fresh version from server
      const conflict = await res.json();
      const retryRes = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus, version: conflict.currentVersion }),
      });
      if (retryRes.ok) {
        const updated = await retryRes.json();
        const applyVersion = (t: TaskData): TaskData =>
          t.id === taskId ? { ...t, version: updated.version } : t;
        setTasks((prev) => prev.map(applyVersion));
        setDueSoon((prev) => prev.map(applyVersion));
      } else {
        await fetchData();
      }
    } else if (!res.ok) {
      // Revert on failure
      await fetchData();
    } else {
      // Update local state with new version from response
      const updated = await res.json();
      const applyVersion = (t: TaskData): TaskData =>
        t.id === taskId ? { ...t, version: updated.version } : t;
      setTasks((prev) => prev.map(applyVersion));
      setDueSoon((prev) => prev.map(applyVersion));
    }
  }

  async function handleComplete(taskId: string, note?: string) {
    // Capture the task title before completing (for undo toast description)
    const task = [...tasks, ...dueSoon].find((t) => t.id === taskId);
    const taskTitle = task?.title ?? "Task";
    const previousStatus = task?.status ?? "NOT_STARTED";

    // Stop timer if running for this task
    let timerResult: { totalTaskMinutes: number } | null = null;
    if (timer.session?.taskId === taskId) {
      timerResult = await timer.stop();
    }

    // Recurring tasks generated from a routine often have task.estimatedMins=null
    // but carry the routine-level estimate via task.routine.estimatedMins. Use it
    // so quick-completing a routine row still triggers the duration prompt.
    const estimatedMins =
      task?.estimatedMins ?? task?.routine?.estimatedMins ?? null;

    function showDurationPrompt() {
      if (timerResult && timerResult.totalTaskMinutes > 0) {
        setActualTimePrompt({
          taskId,
          estimatedMins: estimatedMins || timerResult.totalTaskMinutes,
          prefillMinutes: timerResult.totalTaskMinutes,
          timerSource: true,
        });
      } else if (estimatedMins) {
        setActualTimePrompt({
          taskId,
          estimatedMins,
        });
      }
    }

    function showRecycledToast(recycled: { title: string; nextDue: string }) {
      const nextDate = new Date(
        String(recycled.nextDue).slice(0, 10) + "T12:00:00"
      ).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      toast({
        title: "Recurring task recycled",
        description: `Scheduled "${recycled.title}" for ${nextDate}`,
      });
    }

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task?.version, note }),
    });
    if (res.status === 409) {
      // Auto-retry with fresh version from server
      const conflict = await res.json();
      const retryRes = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: conflict.currentVersion }),
      });
      if (!retryRes.ok) {
        await fetchData();
        return;
      }
      // Use retry response as if it was the original success
      const retryData = await retryRes.json();
      const retryCascade = retryData.cascade;
      const retryRecycledIds = (retryCascade.recycledTasks ?? []).map((t: { id: string }) => t.id);
      pushUndo({
        description: `Completed "${taskTitle}"`,
        reverseAction: async () => {
          await fetch(`/api/tasks/${taskId}/undo-complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              previousStatus,
              deleteRecycledTasks: retryRecycledIds,
              cascade: {
                demoteTasks: retryCascade.promotedTasks.map((t: { id: string }) => t.id),
                reopenProjects: retryCascade.completedProjects.map((p: { id: string }) => p.id),
                revertGoals: retryCascade.updatedGoals.map((g: { id: string; previousProgress: number; previousStatus: string }) => ({
                  id: g.id,
                  previousProgress: g.previousProgress,
                  previousStatus: g.previousStatus,
                })),
              },
            }),
          });
          await fetchData();
        },
      });
      if (retryCascade.recycledTasks?.length > 0) {
        showRecycledToast(retryCascade.recycledTasks[0]);
      }
      showDurationPrompt();
      await fetchData();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      const cascade = data.cascade;
      const recycledTaskIds = (cascade.recycledTasks ?? []).map((t: { id: string }) => t.id);

      // Push undo operation
      pushUndo({
        description: `Completed "${taskTitle}"`,
        reverseAction: async () => {
          await fetch(`/api/tasks/${taskId}/undo-complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              previousStatus,
              deleteRecycledTasks: recycledTaskIds,
              cascade: {
                demoteTasks: cascade.promotedTasks.map((t: { id: string }) => t.id),
                reopenProjects: cascade.completedProjects.map((p: { id: string }) => p.id),
                revertGoals: cascade.updatedGoals.map((g: { id: string; previousProgress: number; previousStatus: string }) => ({
                  id: g.id,
                  previousProgress: g.previousProgress,
                  previousStatus: g.previousStatus,
                })),
              },
            }),
          });
          await fetchData();
        },
      });

      if (cascade.recycledTasks?.length > 0) {
        showRecycledToast(cascade.recycledTasks[0]);
      }

      showDurationPrompt();

      // Refresh data
      await fetchData();
    }
  }

  async function handleActualTimeSubmit(taskId: string, actualMinutes: number) {
    setActualTimePrompt(null);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, actualMinutes }),
    });
  }

  async function handleCheckWindow(
    routineId: string,
    windowId: string,
    date: string,
    status: "completed" | "skipped"
  ) {
    const res = await fetch(`/api/routines/${routineId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowId, date, status }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.allWindowsComplete) {
        toast({ title: "Routine complete", description: "All windows checked off for today." });
      }
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to update window", variant: "destructive" });
    }
  }

  async function handleToggleItem(
    routineId: string,
    windowId: string,
    date: string,
    itemId: string,
    taken: boolean
  ) {
    const res = await fetch(`/api/routines/${routineId}/log`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowId, date, itemId, taken }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.allWindowsComplete) {
        toast({ title: "Routine complete", description: "All windows checked off for today." });
      }
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
    }
  }

  async function handleSkipRoutine(taskId: string, note?: string) {
    const task = [...tasks, ...dueSoon].find((t) => t.id === taskId);

    const res = await fetch(`/api/tasks/${taskId}/skip-recurring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.recycledTask) {
        const nextDate = new Date(String(data.recycledTask.nextDue).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        toast({
          title: "Skipped",
          description: `"${task?.title}" skipped. Next: ${nextDate}`,
        });
      } else {
        toast({ title: "Skipped", description: `"${task?.title}" skipped.` });
      }
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to skip task", variant: "destructive" });
    }
  }

  async function handleDeferRoutine(taskId: string, date: string) {
    const task = [...tasks, ...dueSoon].find((t) => t.id === taskId);

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: taskId,
        scheduledDate: date,
        version: task?.version,
      }),
    });

    if (res.ok) {
      const deferDate = new Date(date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      toast({
        title: "Deferred",
        description: `"${task?.title}" deferred to ${deferDate}`,
      });
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to defer task", variant: "destructive" });
    }
  }

  async function handleDeleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setDueSoon((prev) => prev.filter((t) => t.id !== taskId));
    const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Task deleted" });
    } else {
      toast({ title: "Error", description: "Failed to delete task", variant: "destructive" });
      await fetchData();
    }
  }

  async function handleUpdateTask(taskId: string, updates: Record<string, unknown>) {
    const task = [...tasks, ...dueSoon].find((t) => t.id === taskId);
    // Optimistic update
    const applyUpdates = (t: TaskData): TaskData => {
      if (t.id !== taskId) return t;
      const updated = { ...t };
      if ("title" in updates) updated.title = updates.title as string;
      if ("notes" in updates) updated.notes = updates.notes as string | null;
      if ("energyLevel" in updates) updated.energyLevel = updates.energyLevel as string | null;
      if ("estimatedMins" in updates) updated.estimatedMins = updates.estimatedMins as number | null;
      if ("dueDate" in updates) updated.dueDate = updates.dueDate as string | null;
      if ("contextId" in updates) {
        const ctx = contexts.find((c) => c.id === updates.contextId) || null;
        updated.context = ctx;
      }
      return updated;
    };
    setTasks((prev) => prev.map(applyUpdates));
    setDueSoon((prev) => prev.map(applyUpdates));

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, ...updates, version: task?.version }),
    });
    if (res.status === 409) {
      // Auto-retry with fresh version from server
      const conflict = await res.json();
      const retryRes = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, ...updates, version: conflict.currentVersion }),
      });
      if (retryRes.ok) {
        const updated = await retryRes.json();
        const applyVersion = (t: TaskData): TaskData =>
          t.id === taskId ? { ...t, version: updated.version } : t;
        setTasks((prev) => prev.map(applyVersion));
        setDueSoon((prev) => prev.map(applyVersion));
      } else {
        await fetchData();
      }
    } else if (res.ok) {
      const updated = await res.json();
      const applyVersion = (t: TaskData): TaskData =>
        t.id === taskId ? { ...t, version: updated.version } : t;
      setTasks((prev) => prev.map(applyVersion));
      setDueSoon((prev) => prev.map(applyVersion));
    }
  }

  // Merge dueSoon tasks into main list (deduplicated)
  const allTasks = [...tasks];
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const t of dueSoon) {
    if (!taskIds.has(t.id)) allTasks.push(t);
  }

  // Client-side filtering
  const filteredTasks = allTasks.filter((task) => {
    // Scope filter
    if (selectedScope && selectedScope !== "all") {
      if (selectedScope === "personal") {
        if (task.project?.team) return false;
      } else {
        if (task.project?.team?.id !== selectedScope) return false;
      }
    }
    // Project filter
    if (selectedProjectFilter === "none" && task.project) return false;
    if (selectedProjectFilter === "in_project" && !task.project) return false;
    if (selectedStatus && task.status !== selectedStatus) return false;
    if (selectedContextIds.length > 0 && !selectedContextIds.includes(task.context?.id ?? "")) return false;
    if (selectedSource === "card-file" && !task.routineId) return false;
    if (selectedSource === "health" && !task.routineId) return false;
    if (selectedSource === "regular" && task.routineId) return false;
    if (selectedEnergy && task.energyLevel !== selectedEnergy) return false;
    if (selectedMaxMins && task.estimatedMins && task.estimatedMins > selectedMaxMins) return false;
    if (selectedDue.length > 0) {
      // Use dueDate if set, otherwise fall back to scheduledDate
      const effectiveDate = task.dueDate ?? task.scheduledDate;
      if (!effectiveDate) return false;
      const due = new Date(effectiveDate);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);
      const endOfWeek = new Date(startOfToday);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // Task must match at least one selected due filter
      const matchesAny = selectedDue.some((d) => {
        if (d === "overdue") return due < startOfToday;
        if (d === "today") return due >= startOfToday && due < endOfToday;
        if (d === "week") return due >= startOfToday && due < endOfWeek;
        if (d === "month") return due >= startOfToday && due < endOfMonth;
        return false;
      });
      if (!matchesAny) return false;
    }
    return true;
  });

  // Client-side sorting
  if (selectedSort) {
    filteredTasks.sort((a, b) => {
      switch (selectedSort) {
        case "project": {
          const aName = a.project?.title ?? "";
          const bName = b.project?.title ?? "";
          return aName.localeCompare(bName);
        }
        case "due": {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return aDate - bDate;
        }
        case "context": {
          const aCtx = a.context?.name ?? "";
          const bCtx = b.context?.name ?? "";
          return aCtx.localeCompare(bCtx);
        }
        case "energy": {
          const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          const aE = a.energyLevel ? (order[a.energyLevel] ?? 3) : 3;
          const bE = b.energyLevel ? (order[b.energyLevel] ?? 3) : 3;
          return aE - bE;
        }
        default:
          return 0;
      }
    });
  }

  const selection = useSelection({ items: filteredTasks });

  async function handleBulkDelete() {
    const taskIds = Array.from(selection.selectedIds);
    const res = await fetch("/api/tasks/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds }),
    });
    if (res.ok) {
      const data = await res.json();
      toast({
        title: "Tasks deleted",
        description: `${data.deleted} task${data.deleted !== 1 ? "s" : ""} deleted`,
      });
      selection.deselectAll();
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to delete tasks", variant: "destructive" });
    }
  }

  async function handleBulkUpdate(updates: Record<string, unknown>, label: string) {
    const taskIds = Array.from(selection.selectedIds);
    const res = await fetch("/api/tasks/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds, updates }),
    });
    if (res.ok) {
      const data = await res.json();
      toast({
        title: `${label} updated`,
        description: `${data.updated} task${data.updated !== 1 ? "s" : ""} updated${data.skipped ? `, ${data.skipped} skipped` : ""}`,
      });
      selection.deselectAll();
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to update tasks", variant: "destructive" });
    }
  }

  const { pullDistance, isRefreshing, isPastThreshold } = usePullToRefresh({
    onRefresh: fetchData,
  });

  if (checkingOnboarding || shouldOnboard || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        isPastThreshold={isPastThreshold}
      />
      <ReviewBanner />
      <CalendarBanner events={calendarEvents} />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Do Now
          <HelpLink slug="engage" />
        </h1>
        <p className="text-muted-foreground mt-1">
          {filteredTasks.length} available action{filteredTasks.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Desktop: inline filters */}
      <div className="hidden md:block">
        <FilterBar
          contexts={contexts}
          selectedContextIds={selectedContextIds}
          selectedEnergy={selectedEnergy}
          selectedMaxMins={selectedMaxMins}
          selectedDue={selectedDue}
          selectedStatus={selectedStatus}
          selectedProjectFilter={selectedProjectFilter}
          teams={teams}
          selectedScope={selectedScope}
          selectedSort={selectedSort}
          onContextChange={handleContextChange}
          onEnergyChange={handleEnergyChange}
          onMaxMinsChange={handleMaxMinsChange}
          onDueChange={handleDueChange}
          onStatusChange={handleStatusFilterChange}
          onProjectFilterChange={handleProjectFilterChange}
          selectedSource={selectedSource}
          onSourceChange={handleSourceChange}
          onScopeChange={handleScopeChange}
          onSortChange={handleSortChange}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Mobile: bottom filter tray */}
      <BottomFilterTray
        activeFilterCount={
          (selectedContextIds.length > 0 ? 1 : 0) +
          (selectedEnergy ? 1 : 0) +
          (selectedMaxMins ? 1 : 0) +
          (selectedDue.length > 0 ? 1 : 0) +
          (selectedScope && selectedScope !== "all" ? 1 : 0) +
          (selectedStatus ? 1 : 0) +
          (selectedProjectFilter ? 1 : 0) +
          (selectedSource ? 1 : 0)
        }
      >
        <FilterBar
          contexts={contexts}
          selectedContextIds={selectedContextIds}
          selectedEnergy={selectedEnergy}
          selectedMaxMins={selectedMaxMins}
          selectedDue={selectedDue}
          selectedStatus={selectedStatus}
          selectedProjectFilter={selectedProjectFilter}
          teams={teams}
          selectedScope={selectedScope}
          selectedSort={selectedSort}
          onContextChange={handleContextChange}
          onEnergyChange={handleEnergyChange}
          onMaxMinsChange={handleMaxMinsChange}
          onDueChange={handleDueChange}
          onStatusChange={handleStatusFilterChange}
          onProjectFilterChange={handleProjectFilterChange}
          selectedSource={selectedSource}
          onSourceChange={handleSourceChange}
          onScopeChange={handleScopeChange}
          onSortChange={handleSortChange}
          onClearAll={handleClearAll}
        />
      </BottomFilterTray>

      <Separator />

      {/* Threads Needing Response — collapsible, above tasks */}
      {threadMentions.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setThreadsOpen(!threadsOpen)}
          >
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Threads Needing Response</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {threadMentions.length}
            </Badge>
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", !threadsOpen && "-rotate-90")} />
          </button>
          {threadsOpen && (
            <div className="space-y-2 mt-2">
              {threadMentions.map((t) => (
                <ThreadMentionItem key={t.id} thread={t} onReplied={fetchData} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending Decisions — collapsible, above tasks */}
      {pendingDecisions.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setDecisionsOpen(!decisionsOpen)}
          >
            <Vote className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Decisions Awaiting Response</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {pendingDecisions.length}
            </Badge>
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform", !decisionsOpen && "-rotate-90")} />
          </button>
          {decisionsOpen && (
            <div className="space-y-2 mt-2">
              {pendingDecisions.map((d) => (
                <div key={d.id}>
                  <PendingDecisionItem
                    decision={d}
                    onClick={() => setExpandedDecisionId(expandedDecisionId === d.id ? null : d.id)}
                  />
                  {expandedDecisionId === d.id && session?.user?.id && (
                    <div className="mt-1 ml-2">
                      <DecisionCard
                        decision={d}
                        currentUserId={session.user.id}
                        onVote={async (decisionId, vote, comment) => {
                          const res = await fetch(`/api/decisions/${decisionId}/respond`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ vote, comment }),
                          });
                          if (res.ok) await fetchData();
                          else toast({ title: "Error", description: "Failed to submit vote", variant: "destructive" });
                        }}
                        onResolve={async (decisionId, resolution, chosenOptionId) => {
                          const res = await fetch(`/api/decisions/${decisionId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ resolution, chosenOptionId }),
                          });
                          if (res.ok) {
                            setExpandedDecisionId(null);
                            await fetchData();
                            toast({ title: "Decision resolved" });
                          } else {
                            toast({ title: "Error", description: "Failed to resolve decision", variant: "destructive" });
                          }
                        }}
                        onWithdraw={async (decisionId) => {
                          const res = await fetch(`/api/decisions/${decisionId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ withdraw: true }),
                          });
                          if (res.ok) {
                            setExpandedDecisionId(null);
                            await fetchData();
                            toast({ title: "Decision withdrawn" });
                          } else {
                            toast({ title: "Error", description: "Failed to withdraw decision", variant: "destructive" });
                          }
                        }}
                        onVoteOption={async (decisionId, optionId) => {
                          const res = await fetch(`/api/decisions/${decisionId}/vote-option`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ optionId }),
                          });
                          if (res.ok) await fetchData();
                          else toast({ title: "Error", description: "Failed to vote", variant: "destructive" });
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selection controls */}
      {filteredTasks.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={selection.isSelectionMode ? selection.deselectAll : selection.selectAll}
            className="hover:text-foreground transition-colors"
          >
            {selection.isSelectionMode ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}

      {/* Actual time prompt after completion */}
      {actualTimePrompt && (
        <ActualTimePrompt
          taskId={actualTimePrompt.taskId}
          estimatedMins={actualTimePrompt.estimatedMins}
          onSubmit={handleActualTimeSubmit}
          onDismiss={() => setActualTimePrompt(null)}
          prefillMinutes={actualTimePrompt.prefillMinutes}
          timerSource={actualTimePrompt.timerSource}
        />
      )}

      {/* Next Actions */}
      {filteredTasks.length > 0 ? (
        <div className="space-y-2">
          {filteredTasks.map((task) =>
            task.routine ? (
              <RoutineCard
                key={task.id}
                task={task as unknown as RoutineCardTask}
                onCheckWindow={handleCheckWindow}
                onToggleItem={handleToggleItem}
                onComplete={(id) => handleComplete(id)}
                onSkip={handleSkipRoutine}
                onDefer={handleDeferRoutine}
              />
            ) : (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onStatusChange={handleStatusChange}
                contexts={contexts}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onFilterLooseTasks={() => handleProjectFilterChange("none")}
                onFilterEnergy={(level) => handleEnergyChange(level)}
                onFilterContext={(contextId) => handleContextChange([contextId])}
                onFilterTime={(mins) => handleMaxMinsChange(mins)}
                onFilterDue={(due) => handleDueChange([due])}
                isSelected={selection.isSelected(task.id)}
                onToggleSelect={() => selection.toggle(task.id)}
              />
            )
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              {tasks.length === 0
                ? "No available actions. Capture something in your Inbox!"
                : "No tasks match your current filters."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Waiting For */}
      {waitingFor.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4" />
              Waiting For
            </h2>
            <div className="space-y-2">
              {waitingFor.map((wf) => (
                <Card key={wf.id}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span>{wf.description}</span>
                      <Badge variant="outline" className="text-xs ml-2">
                        {wf.person}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {selection.isSelectionMode && (
        <BulkActionBar
          selectionCount={selection.selectionCount}
          contexts={contexts}
          onChangeContext={(id) => handleBulkUpdate({ contextId: id }, "Context")}
          onChangeEnergy={(e) => handleBulkUpdate({ energyLevel: e }, "Energy")}
          onChangeTime={(m) => handleBulkUpdate({ estimatedMins: m }, "Time estimate")}
          onChangeStatus={(s) => handleBulkUpdate({ status: s }, "Status")}
          onChangeDueDate={(d) => handleBulkUpdate({ dueDate: d }, "Due date")}
          onDelete={handleBulkDelete}
          onDeselectAll={selection.deselectAll}
        />
      )}
    </div>
  );
}

export default function DoNowPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <DoNowContent />
    </Suspense>
  );
}
