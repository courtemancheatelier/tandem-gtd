"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TaskCard } from "@/components/tasks/TaskCard";
import { FilterBar } from "@/components/tasks/FilterBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Zap, Clock, Loader2 } from "lucide-react";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { useOnboardingCheck } from "@/lib/hooks/use-onboarding-check";
import { useSelection } from "@/lib/hooks/use-selection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { HelpLink } from "@/components/shared/HelpLink";
import { useUndo } from "@/contexts/UndoContext";
import { BottomFilterTray } from "@/components/layout/BottomFilterTray";

interface TaskData {
  id: string;
  title: string;
  notes?: string | null;
  status: string;
  isNextAction: boolean;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  dueDate?: string | null;
  scheduledDate?: string | null;
  recurringTemplateId?: string | null;
  version: number;
  project?: { id: string; title: string; type: string; team?: { id: string; name: string; icon?: string | null } | null } | null;
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
  const [loading, setLoading] = useState(true);

  // Read initial filter values from URL search params
  const urlContext = searchParams.get("context");
  const urlEnergy = searchParams.get("energy");
  const urlMaxTime = searchParams.get("maxTime");
  const urlDue = searchParams.get("due");
  const urlScope = searchParams.get("scope");
  const urlStatus = searchParams.get("status");
  const urlProject = searchParams.get("project");
  const urlSource = searchParams.get("source");

  // Filter state — synced from URL search params whenever they change
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(urlEnergy || null);
  const [selectedMaxMins, setSelectedMaxMins] = useState<number | null>(
    urlMaxTime ? parseInt(urlMaxTime, 10) : null
  );
  const [selectedDue, setSelectedDue] = useState<string | null>(urlDue || null);
  const [selectedScope, setSelectedScope] = useState<string | null>(urlScope || null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(urlStatus || null);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(urlProject || null);
  const [selectedSource, setSelectedSource] = useState<string | null>(urlSource || null);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, contextsRes, teamsRes] = await Promise.all([
        fetch("/api/tasks/available"),
        fetch("/api/contexts"),
        fetch("/api/teams"),
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
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync filters from URL search params whenever they change
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
    setSelectedEnergy(urlEnergy || null);
    setSelectedMaxMins(urlMaxTime ? parseInt(urlMaxTime, 10) : null);
    setSelectedDue(urlDue || null);
    setSelectedScope(urlScope || null);
    setSelectedStatus(urlStatus || null);
    setSelectedProjectFilter(urlProject || null);
    setSelectedSource(urlSource || null);
  }, [contexts, urlContext, urlEnergy, urlMaxTime, urlDue, urlScope, urlStatus, urlProject, urlSource]);

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

  function handleDueChange(due: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (due) params.set("due", due);
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
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchData();
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

  async function handleComplete(taskId: string) {
    // Capture the task title before completing (for undo toast description)
    const task = [...tasks, ...dueSoon].find((t) => t.id === taskId);
    const taskTitle = task?.title ?? "Task";
    const previousStatus = task?.status ?? "NOT_STARTED";

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
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

      // Show recycling toast
      if (cascade.recycledTasks?.length > 0) {
        const r = cascade.recycledTasks[0];
        const nextDate = new Date(r.nextDue).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        toast({
          title: "Recurring task recycled",
          description: `Scheduled "${r.title}" for ${nextDate}`,
        });
      }

      // Refresh data
      await fetchData();
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
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchData();
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
    if (selectedSource === "card-file" && !task.recurringTemplateId) return false;
    if (selectedSource === "regular" && task.recurringTemplateId) return false;
    if (selectedEnergy && task.energyLevel !== selectedEnergy) return false;
    if (selectedMaxMins && task.estimatedMins && task.estimatedMins > selectedMaxMins) return false;
    if (selectedDue && task.dueDate) {
      const due = new Date(task.dueDate);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);
      const endOfWeek = new Date(startOfToday);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      if (selectedDue === "overdue" && due >= startOfToday) return false;
      if (selectedDue === "today" && (due < startOfToday || due >= endOfToday)) return false;
      if (selectedDue === "week" && (due < startOfToday || due >= endOfWeek)) return false;
      if (selectedDue === "month" && (due < startOfToday || due >= endOfMonth)) return false;
    } else if (selectedDue) {
      // No due date set — filter it out when a due filter is active
      return false;
    }
    return true;
  });

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

  if (checkingOnboarding || shouldOnboard || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReviewBanner />
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
          onContextChange={handleContextChange}
          onEnergyChange={handleEnergyChange}
          onMaxMinsChange={handleMaxMinsChange}
          onDueChange={handleDueChange}
          onStatusChange={handleStatusFilterChange}
          onProjectFilterChange={handleProjectFilterChange}
          selectedSource={selectedSource}
          onSourceChange={handleSourceChange}
          onScopeChange={handleScopeChange}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Mobile: bottom filter tray */}
      <BottomFilterTray
        activeFilterCount={
          (selectedContextIds.length > 0 ? 1 : 0) +
          (selectedEnergy ? 1 : 0) +
          (selectedMaxMins ? 1 : 0) +
          (selectedDue ? 1 : 0) +
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
          onContextChange={handleContextChange}
          onEnergyChange={handleEnergyChange}
          onMaxMinsChange={handleMaxMinsChange}
          onDueChange={handleDueChange}
          onStatusChange={handleStatusFilterChange}
          onProjectFilterChange={handleProjectFilterChange}
          selectedSource={selectedSource}
          onSourceChange={handleSourceChange}
          onScopeChange={handleScopeChange}
          onClearAll={handleClearAll}
        />
      </BottomFilterTray>

      <Separator />

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

      {/* Next Actions */}
      {filteredTasks.length > 0 ? (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
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
              onFilterDue={(due) => handleDueChange(due)}
              isSelected={selection.isSelected(task.id)}
              onToggleSelect={() => selection.toggle(task.id)}
            />
          ))}
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
