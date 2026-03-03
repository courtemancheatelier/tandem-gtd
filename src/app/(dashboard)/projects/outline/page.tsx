"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { MasterOutlineView } from "@/components/projects/MasterOutlineView";
import type { OutlineProject, OutlineActions } from "@/components/projects/MasterOutlineView";
import { Loader2, ArrowLeft, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import Link from "next/link";
import { TeamIcon } from "@/components/teams/team-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useUndo } from "@/contexts/UndoContext";
import { BottomFilterTray } from "@/components/layout/BottomFilterTray";

interface Area {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
  icon?: string | null;
}

function removeTaskFromProjects(projects: OutlineProject[], taskId: string): OutlineProject[] {
  return projects.map((p) => ({
    ...p,
    tasks: p.tasks.filter((t) => t.id !== taskId),
    taskCounts: {
      ...p.taskCounts,
      active: p.tasks.some((t) => t.id === taskId) ? p.taskCounts.active - 1 : p.taskCounts.active,
      completed: p.tasks.some((t) => t.id === taskId) ? p.taskCounts.completed + 1 : p.taskCounts.completed,
    },
    childProjects: removeTaskFromProjects(p.childProjects, taskId),
  }));
}

export default function ProjectOutlinePage() {
  const { toast } = useToast();
  const { push: pushUndo } = useUndo();
  const [projects, setProjects] = useState<OutlineProject[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeSomeday, setIncludeSomeday] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string>("__all__");
  const [teamFilter, setTeamFilter] = useState<string>("__all__");
  const outlineRef = useRef<OutlineActions | null>(null);
  const [, forceRender] = useState(0);
  const [projectFilter, setProjectFilter] = useState<string>("__all__");

  const filteredProjects = useMemo(() => {
    if (projectFilter === "__all__") return projects;
    return projects.filter((p) => p.id === projectFilter);
  }, [projects, projectFilter]);

  const fetchOutline = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (includeSomeday) params.set("includeSomeday", "true");
      if (areaFilter !== "__all__") params.set("areaId", areaFilter);
      if (teamFilter !== "__all__") params.set("teamId", teamFilter);

      const res = await fetch(`/api/projects/outline?${params.toString()}`);
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [includeSomeday, areaFilter, teamFilter]);

  useEffect(() => {
    fetchOutline();
  }, [fetchOutline]);

  useEffect(() => {
    fetch("/api/areas?active=true")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAreas)
      .catch(() => {});
    fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((data) => setTeams(data.teams || []))
      .catch(() => {});
  }, []);

  async function handleAddTask(projectId: string, title: string) {
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, sortOrder: 999 }),
    });
    if (res.ok) {
      toast({ title: "Task added", description: title });
      await fetchOutline();
    } else {
      toast({
        title: "Error",
        description: "Failed to add task",
        variant: "destructive",
      });
    }
  }

  function findTaskInTree(projs: OutlineProject[], taskId: string): { version: number } | null {
    for (const p of projs) {
      const t = p.tasks.find((t) => t.id === taskId);
      if (t) return { version: t.version };
      const found = findTaskInTree(p.childProjects, taskId);
      if (found) return found;
    }
    return null;
  }

  async function handleStatusChange(taskId: string, status: string) {
    const taskInfo = findTaskInTree(projects, taskId);
    // Optimistic update: change status in nested tree
    function updateTaskStatus(projs: OutlineProject[]): OutlineProject[] {
      return projs.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === taskId ? { ...t, status } : t
        ),
        childProjects: updateTaskStatus(p.childProjects),
      }));
    }
    setProjects((prev) => updateTaskStatus(prev));

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status, version: taskInfo?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchOutline();
    } else if (!res.ok) {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
      await fetchOutline();
    }
  }

  async function handleRenameTask(taskId: string, title: string) {
    const taskInfo = findTaskInTree(projects, taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, title, version: taskInfo?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchOutline();
    } else if (res.ok) {
      await fetchOutline();
    } else {
      toast({
        title: "Error",
        description: "Failed to rename task",
        variant: "destructive",
      });
    }
  }

  function findProjectInTree(projs: OutlineProject[], projId: string): OutlineProject | null {
    for (const p of projs) {
      if (p.id === projId) return p;
      const found = findProjectInTree(p.childProjects, projId);
      if (found) return found;
    }
    return null;
  }

  async function handleCompleteProject(projectId: string) {
    const proj = findProjectInTree(projects, projectId);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED", version: proj?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
      await fetchOutline();
    } else if (res.ok) {
      const data = await res.json();
      const cascade = data.cascade;
      toast({ title: "Project completed" });
      if (cascade?.completedTasks?.length > 0) {
        toast({
          title: "Tasks completed",
          description: `${cascade.completedTasks.length} task${cascade.completedTasks.length !== 1 ? "s" : ""} completed`,
        });
      }
      await fetchOutline();
    } else {
      toast({
        title: "Error",
        description: "Failed to complete project",
        variant: "destructive",
      });
    }
  }

  async function handleCompleteTask(taskId: string) {
    // Find task in nested tree before optimistic removal
    function findTask(projs: OutlineProject[]): { title: string; status: string; version: number } | null {
      for (const p of projs) {
        const t = p.tasks.find((t) => t.id === taskId);
        if (t) return { title: t.title, status: t.status, version: t.version };
        const found = findTask(p.childProjects);
        if (found) return found;
      }
      return null;
    }
    const taskInfo = findTask(projects);
    const taskTitle = taskInfo?.title ?? "Task";
    const previousStatus = taskInfo?.status ?? "NOT_STARTED";

    // Optimistic: remove task from UI immediately
    setProjects((prev) => removeTaskFromProjects(prev, taskId));

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: taskInfo?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchOutline();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      const cascade = data.cascade;
      const recycledTaskIds = (cascade.recycledTasks ?? []).map((t: { id: string }) => t.id);

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
          await fetchOutline();
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

      // Re-fetch to get accurate state
      await fetchOutline();
    } else {
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive",
      });
      // Revert optimistic update on failure
      await fetchOutline();
    }
  }

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Projects
        </Link>
        <h1 className="text-2xl font-bold">Project Outline</h1>
        <p className="text-muted-foreground text-sm">
          All active projects and their tasks at a glance
        </p>
      </div>

      {/* Expand/Collapse (always visible) */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => {
            if (outlineRef.current?.isAllExpanded) {
              outlineRef.current.collapseAll();
            } else {
              outlineRef.current?.expandAll();
            }
            forceRender((n) => n + 1);
          }}
        >
          {outlineRef.current?.isAllExpanded ? (
            <><ChevronsDownUp className="h-3 w-3 mr-1" /> Collapse</>
          ) : (
            <><ChevronsUpDown className="h-3 w-3 mr-1" /> Expand</>
          )}
        </Button>
      </div>

      {/* Filter bar — desktop */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        {projects.length > 0 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {areas.length > 0 && (
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All areas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {teams.length > 0 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All teams</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-1.5"><TeamIcon icon={t.icon} className="h-3.5 w-3.5" />{t.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox
            checked={includeSomeday}
            onCheckedChange={(checked) => setIncludeSomeday(checked === true)}
          />
          <span className="text-xs text-muted-foreground">Someday/Maybe</span>
        </label>

        {(projectFilter !== "__all__" || areaFilter !== "__all__" || teamFilter !== "__all__" || includeSomeday) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => {
              setProjectFilter("__all__");
              setAreaFilter("__all__");
              setTeamFilter("__all__");
              setIncludeSomeday(false);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Filter bar — mobile bottom tray */}
      <BottomFilterTray
        activeFilterCount={
          (projectFilter !== "__all__" ? 1 : 0) +
          (areaFilter !== "__all__" ? 1 : 0) +
          (teamFilter !== "__all__" ? 1 : 0) +
          (includeSomeday ? 1 : 0)
        }
      >
        <div className="space-y-3">
          {projects.length > 0 && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {areas.length > 0 && (
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="All areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All areas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {teams.length > 0 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All teams</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-1.5"><TeamIcon icon={t.icon} className="h-3.5 w-3.5" />{t.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={includeSomeday}
              onCheckedChange={(checked) => setIncludeSomeday(checked === true)}
            />
            <span className="text-xs text-muted-foreground">Someday/Maybe</span>
          </label>

          {(projectFilter !== "__all__" || areaFilter !== "__all__" || teamFilter !== "__all__" || includeSomeday) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 w-full"
              onClick={() => {
                setProjectFilter("__all__");
                setAreaFilter("__all__");
                setTeamFilter("__all__");
                setIncludeSomeday(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </BottomFilterTray>

      {/* Content */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No active projects</p>
          </CardContent>
        </Card>
      ) : (
        <MasterOutlineView
          projects={filteredProjects}
          onCompleteTask={handleCompleteTask}
          onCompleteProject={handleCompleteProject}
          onStatusChange={handleStatusChange}
          onAddTask={handleAddTask}
          onRenameTask={handleRenameTask}
          onTeamFilter={setTeamFilter}
          onAreaFilter={setAreaFilter}
          autoExpandAll={projectFilter !== "__all__"}
          actionsRef={outlineRef}
        />
      )}
    </div>
  );
}
