"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useUndo } from "@/contexts/UndoContext";
import { useSelection } from "@/lib/hooks/use-selection";
import { MasterOutlineView } from "@/components/projects/MasterOutlineView";
import type { OutlineProject, OutlineActions } from "@/components/projects/MasterOutlineView";
import type { OutlineMenuActions } from "@/components/projects/OutlineRowMenu";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { Loader2, ChevronsUpDown, ChevronsDownUp, Rows3, Rows4, FolderPlus, Plus, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ContextItem {
  id: string;
  name: string;
  color: string | null;
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

function collectAllTasks(project: OutlineProject): { id: string }[] {
  const tasks: { id: string }[] = [];
  for (const t of project.tasks) {
    if (t.status !== "COMPLETED" && t.status !== "DROPPED") {
      tasks.push({ id: t.id });
    }
  }
  for (const child of project.childProjects) {
    tasks.push(...collectAllTasks(child));
  }
  return tasks;
}

function collectMoveTargets(project: OutlineProject, excludeId?: string, prefix?: string): { id: string; title: string }[] {
  const targets: { id: string; title: string }[] = [];
  const label = prefix ? `${prefix} › ${project.title}` : project.title;
  if (project.id !== excludeId) {
    targets.push({ id: project.id, title: label });
  }
  for (const child of project.childProjects) {
    targets.push(...collectMoveTargets(child, excludeId, label));
  }
  return targets;
}

interface ProjectOutlineTabProps {
  projectId: string;
  onDataChange?: () => void;
}

const VIEW_MODE_KEY = "outline-view-mode-";

export function ProjectOutlineTab({ projectId, onDataChange }: ProjectOutlineTabProps) {
  const { toast } = useToast();
  const { push: pushUndo } = useUndo();
  const [outlineData, setOutlineData] = useState<OutlineProject | null>(null);
  const [loading, setLoading] = useState(true);
  const outlineRef = useRef<OutlineActions | null>(null);
  const [, forceRender] = useState(0);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [compact, setCompact] = useState(false);
  const [taskReorderProjectId, setTaskReorderProjectId] = useState<string | null>(null);

  // Load view mode from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY + projectId);
      if (saved === "compact") setCompact(true);
    } catch {
      // ignore
    }
  }, [projectId]);

  function toggleViewMode() {
    const next = !compact;
    setCompact(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY + projectId, next ? "compact" : "comfortable");
    } catch {
      // ignore
    }
  }

  // Flatten tasks for selection hook
  const allTasks = outlineData ? collectAllTasks(outlineData) : [];
  const selection = useSelection({ items: allTasks });

  const fetchOutline = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/outline`);
      if (res.ok) {
        setOutlineData(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch contexts
  useEffect(() => {
    fetch("/api/contexts")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setContexts(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchOutline();
  }, [fetchOutline]);

  function findTaskInTree(projs: OutlineProject[], taskId: string): { version: number } | null {
    for (const p of projs) {
      const t = p.tasks.find((t) => t.id === taskId);
      if (t) return { version: t.version };
      const found = findTaskInTree(p.childProjects, taskId);
      if (found) return found;
    }
    return null;
  }

  function findProjectInTree(projs: OutlineProject[], projId: string): OutlineProject | null {
    for (const p of projs) {
      if (p.id === projId) return p;
      const found = findProjectInTree(p.childProjects, projId);
      if (found) return found;
    }
    return null;
  }

  function parseTaskTitles(input: string): string[] {
    // Split on numbered list patterns: "1. foo 2.bar" or "1) foo 2)bar" (space after dot/paren is optional)
    const numbered = input.split(/(?:^|\s+)\d+[.)]\s*/).filter(Boolean);
    if (numbered.length > 1) return numbered.map((t) => t.trim()).filter(Boolean);
    // Split on newlines
    const lines = input.split(/\n/).map((l) => l.replace(/^\s*[-•*]\s*/, "").replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
    if (lines.length > 1) return lines;
    return [input];
  }

  async function handleAddTask(targetProjectId: string, title: string) {
    const titles = parseTaskTitles(title);
    let addedCount = 0;
    for (const t of titles) {
      const res = await fetch(`/api/projects/${targetProjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, sortOrder: 999 + addedCount }),
      });
      if (res.ok) addedCount++;
    }
    if (addedCount > 0) {
      toast({ title: addedCount === 1 ? "Task added" : `${addedCount} tasks added`, description: addedCount === 1 ? titles[0] : undefined });
      await fetchOutline();
      onDataChange?.();
    } else {
      toast({ title: "Error", description: "Failed to add task", variant: "destructive" });
    }
  }

  async function handleStatusChange(taskId: string, status: string) {
    const allProjects = outlineData ? [outlineData] : [];
    const taskInfo = findTaskInTree(allProjects, taskId);

    // Optimistic update
    function updateTaskStatus(projs: OutlineProject[]): OutlineProject[] {
      return projs.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
        childProjects: updateTaskStatus(p.childProjects),
      }));
    }
    if (outlineData) {
      const [updated] = updateTaskStatus([outlineData]);
      setOutlineData(updated);
    }

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status, version: taskInfo?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
    } else if (!res.ok) {
      toast({ title: "Error", description: "Failed to update task status", variant: "destructive" });
    }
    // Always refetch to keep versions in sync
    await fetchOutline();
    onDataChange?.();
  }

  async function handleRenameTask(taskId: string, title: string) {
    const allProjects = outlineData ? [outlineData] : [];
    const taskInfo = findTaskInTree(allProjects, taskId);
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
      toast({ title: "Error", description: "Failed to rename task", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleCompleteProject(completedProjectId: string) {
    const allProjects = outlineData ? [outlineData] : [];
    const proj = findProjectInTree(allProjects, completedProjectId);
    const res = await fetch(`/api/projects/${completedProjectId}`, {
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
      toast({ title: "Error", description: "Failed to complete project", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleCompleteTask(taskId: string, note?: string) {
    const allProjects = outlineData ? [outlineData] : [];

    function findTask(projs: OutlineProject[]): { title: string; status: string; version: number } | null {
      for (const p of projs) {
        const t = p.tasks.find((t) => t.id === taskId);
        if (t) return { title: t.title, status: t.status, version: t.version };
        const found = findTask(p.childProjects);
        if (found) return found;
      }
      return null;
    }
    const taskInfo = findTask(allProjects);
    const taskTitle = taskInfo?.title ?? "Task";
    const previousStatus = taskInfo?.status ?? "NOT_STARTED";

    // Optimistic removal
    if (outlineData) {
      const [updated] = removeTaskFromProjects([outlineData], taskId);
      setOutlineData(updated);
    }

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: taskInfo?.version, note }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchOutline();
      onDataChange?.();
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
          onDataChange?.();
        },
      });

      if (cascade.recycledTasks?.length > 0) {
        const r = cascade.recycledTasks[0];
        const nextDate = new Date(String(r.nextDue).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        toast({
          title: "Recurring task recycled",
          description: `Scheduled "${r.title}" for ${nextDate}`,
        });
      }

      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to complete task", variant: "destructive" });
      await fetchOutline();
    }
    onDataChange?.();
  }

  // --- Phase 1: Context menu handlers ---

  async function handleSetContext(taskId: string, contextId: string | null) {
    const allProjects = outlineData ? [outlineData] : [];
    const taskInfo = findTaskInTree(allProjects, taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, contextId: contextId ?? null, version: taskInfo?.version }),
    });
    if (res.ok) {
      toast({ title: "Context updated" });
      await fetchOutline();
    } else if (res.status === 409) {
      toast({ title: "Conflict", description: "Refreshing...", variant: "destructive" });
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to set context", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleSetDueDate(taskId: string, dueDate: string | null) {
    const allProjects = outlineData ? [outlineData] : [];
    const taskInfo = findTaskInTree(allProjects, taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, dueDate: dueDate ?? null, version: taskInfo?.version }),
    });
    if (res.ok) {
      toast({ title: dueDate ? "Due date set" : "Due date cleared" });
      await fetchOutline();
    } else if (res.status === 409) {
      toast({ title: "Conflict", description: "Refreshing...", variant: "destructive" });
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to set due date", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleMoveTask(taskId: string, targetProjectId: string) {
    const allProjects = outlineData ? [outlineData] : [];
    const taskInfo = findTaskInTree(allProjects, taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, projectId: targetProjectId, version: taskInfo?.version }),
    });
    if (res.ok) {
      toast({ title: "Task moved" });
      await fetchOutline();
    } else if (res.status === 409) {
      toast({ title: "Conflict", description: "Refreshing...", variant: "destructive" });
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to move task", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleDeleteTask(taskId: string) {
    const res = await fetch(`/api/tasks?id=${taskId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast({ title: "Task deleted" });
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to delete task", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleDeleteProject(deletedProjectId: string) {
    const res = await fetch(`/api/projects/${deletedProjectId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast({ title: "Project deleted" });
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleAddSubProject(parentId: string, title: string) {
    const res = await fetch(`/api/projects/${parentId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      toast({ title: "Sub-project created", description: title });
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleReorderTasks(targetProjectId: string, orderedTaskIds: string[]) {
    // Optimistic update
    if (outlineData) {
      const reorderInTree = (projs: OutlineProject[]): OutlineProject[] =>
        projs.map((p) => {
          if (p.id === targetProjectId) {
            const taskMap = new Map(p.tasks.map((t) => [t.id, t]));
            const reordered = orderedTaskIds.map((id) => taskMap.get(id)).filter(Boolean) as typeof p.tasks;
            const rest = p.tasks.filter((t) => !orderedTaskIds.includes(t.id));
            return { ...p, tasks: [...reordered, ...rest] };
          }
          return { ...p, childProjects: reorderInTree(p.childProjects) };
        });
      const [updated] = reorderInTree([outlineData]);
      setOutlineData(updated);
    }

    try {
      const res = await fetch(`/api/projects/${targetProjectId}/tasks/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: orderedTaskIds }),
      });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to reorder tasks", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to reorder tasks", variant: "destructive" });
    }
    await fetchOutline();
    onDataChange?.();
  }

  // --- Phase 2: Type badge toggle ---

  async function handleToggleProjectType(toggleProjectId: string, newType: string, version: number) {
    // Optimistic update
    function updateType(projs: OutlineProject[]): OutlineProject[] {
      return projs.map((p) => ({
        ...p,
        type: p.id === toggleProjectId ? newType : p.type,
        childProjects: updateType(p.childProjects),
      }));
    }
    if (outlineData) {
      const [updated] = updateType([outlineData]);
      setOutlineData(updated);
    }

    let res = await fetch(`/api/projects/${toggleProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: newType, version }),
    });
    if (res.status === 409) {
      // Version conflict — auto-retry with fresh version
      const conflict = await res.json().catch(() => ({}));
      if (conflict.currentVersion) {
        res = await fetch(`/api/projects/${toggleProjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: newType, version: conflict.currentVersion }),
        });
      }
    }
    if (!res.ok) {
      toast({ title: "Error", description: "Failed to update project type", variant: "destructive" });
    }
    await fetchOutline();
    onDataChange?.();
  }

  // --- Phase 3: Promote / Demote ---

  async function handleDemoteToSubProject(taskId: string, taskTitle: string, parentId: string) {
    // Create sub-project with task title
    const createRes = await fetch(`/api/projects/${parentId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle }),
    });
    if (!createRes.ok) {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
      return;
    }

    // Delete original task
    const delRes = await fetch(`/api/tasks?id=${taskId}`, {
      method: "DELETE",
    });
    if (!delRes.ok) {
      toast({ title: "Error", description: "Task converted but original could not be removed", variant: "destructive" });
    } else {
      toast({ title: "Converted to sub-project", description: taskTitle });
    }
    await fetchOutline();
    onDataChange?.();
  }

  async function handlePromoteToTask(promoteProjectId: string, projectTitle: string, parentId: string) {
    // Validate: project has no tasks and no children
    const allProjects = outlineData ? [outlineData] : [];
    const proj = findProjectInTree(allProjects, promoteProjectId);
    if (proj && (proj.tasks.length > 0 || proj.childProjects.length > 0)) {
      toast({ title: "Cannot convert", description: "Project must be empty to convert to task", variant: "destructive" });
      return;
    }

    // Create task with project title
    const createRes = await fetch(`/api/projects/${parentId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: projectTitle, sortOrder: 999 }),
    });
    if (!createRes.ok) {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
      return;
    }

    // Delete sub-project
    const delRes = await fetch(`/api/projects/${promoteProjectId}`, {
      method: "DELETE",
    });
    if (!delRes.ok) {
      toast({ title: "Error", description: "Task created but sub-project could not be removed", variant: "destructive" });
    } else {
      toast({ title: "Converted to task", description: projectTitle });
    }
    await fetchOutline();
    onDataChange?.();
  }

  // --- Phase 4: Bulk actions ---

  async function handleBulkUpdate(updates: Record<string, unknown>, label: string) {
    const taskIds = Array.from(selection.selectedIds);
    const res = await fetch("/api/tasks/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds, updates }),
    });
    if (res.ok) {
      toast({ title: `${label} updated`, description: `${taskIds.length} task${taskIds.length !== 1 ? "s" : ""} updated` });
      selection.deselectAll();
      await fetchOutline();
    } else {
      toast({ title: "Error", description: `Failed to update ${label.toLowerCase()}`, variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleBulkDelete() {
    const taskIds = Array.from(selection.selectedIds);
    const res = await fetch("/api/tasks/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds }),
    });
    if (res.ok) {
      toast({ title: "Tasks deleted", description: `${taskIds.length} task${taskIds.length !== 1 ? "s" : ""} deleted` });
      selection.deselectAll();
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to delete tasks", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleBulkMoveToSubProject(subProjectId: string) {
    const taskIds = Array.from(selection.selectedIds);
    const res = await fetch("/api/tasks/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds, updates: { projectId: subProjectId } }),
    });
    if (res.ok) {
      toast({ title: "Tasks moved" });
      selection.deselectAll();
      await fetchOutline();
    } else {
      toast({ title: "Error", description: "Failed to move tasks", variant: "destructive" });
    }
    onDataChange?.();
  }

  async function handleBulkCreateAndMove(title: string) {
    const createRes = await fetch(`/api/projects/${projectId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!createRes.ok) {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
      return;
    }
    const newProject = await createRes.json();
    await handleBulkMoveToSubProject(newProject.id);
  }

  // Build menu actions
  const moveTargets = outlineData ? collectMoveTargets(outlineData) : [];
  const menuActions: OutlineMenuActions = {
    contexts,
    moveTargets,
    onSetStatus: handleStatusChange,
    onCompleteTask: (taskId) => handleCompleteTask(taskId),
    onSetContext: handleSetContext,
    onSetDueDate: handleSetDueDate,
    onMoveTask: handleMoveTask,
    onDeleteTask: handleDeleteTask,
    onDemoteToSubProject: handleDemoteToSubProject,
    onDeleteProject: handleDeleteProject,
    onPromoteToTask: handlePromoteToTask,
    onAddTask: (addToProjectId) => {
      // Focus the add task input — trigger the button click
      const section = document.querySelector(`[data-project-id="${addToProjectId}"]`);
      const btn = section?.querySelector<HTMLButtonElement>("[data-add-task-btn]");
      btn?.click();
    },
    onAddSubProject: handleAddSubProject,
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!outlineData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Failed to load outline</p>
        </CardContent>
      </Card>
    );
  }

  const hasContent = outlineData.childProjects.length > 0 || outlineData.tasks.length > 0;

  // Phase 6: Empty state
  if (!hasContent) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <ListChecks className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">This project has no tasks yet.</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const title = prompt("Task title:");
                if (title?.trim()) handleAddTask(projectId, title.trim());
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add task
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const title = prompt("Sub-project title:");
                if (title?.trim()) handleAddSubProject(projectId, title.trim());
              }}
            >
              <FolderPlus className="h-4 w-4 mr-1" /> Add sub-project
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wrap the root project as a single-element array for MasterOutlineView
  const outlineRoot: OutlineProject = {
    ...outlineData,
    isSomedayMaybe: false,
    area: null,
    team: null,
  };

  // Sub-projects for bulk move picker
  const subProjects = (outlineData.childProjects ?? []).map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
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

        {/* Compact / Comfortable toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={toggleViewMode}
          title={compact ? "Switch to comfortable" : "Switch to compact"}
        >
          {compact ? (
            <><Rows4 className="h-3 w-3 mr-1" /> Comfortable</>
          ) : (
            <><Rows3 className="h-3 w-3 mr-1" /> Compact</>
          )}
        </Button>
      </div>

      {/* Root tasks info */}
      {outlineData.childProjects.length > 0 && outlineData.tasks.length > 0 && (
        <div className="text-xs text-muted-foreground mb-1">
          Root tasks and sub-projects shown below
        </div>
      )}

      <MasterOutlineView
        projects={[outlineRoot]}
        onCompleteTask={handleCompleteTask}
        onCompleteProject={handleCompleteProject}
        onStatusChange={handleStatusChange}
        onAddTask={handleAddTask}
        onRenameTask={handleRenameTask}
        autoExpandAll
        actionsRef={outlineRef}
        menuActions={menuActions}
        onToggleProjectType={handleToggleProjectType}
        onDemoteToSubProject={handleDemoteToSubProject}
        onPromoteToTask={handlePromoteToTask}
        selectionMode={selection.isSelectionMode}
        selectedTaskIds={selection.selectedIds}
        onToggleTaskSelection={selection.toggle}
        compact={compact}
        onReorderTasks={handleReorderTasks}
        taskReorderProjectId={taskReorderProjectId}
        onSetTaskReorderProjectId={setTaskReorderProjectId}
      />

      {/* Bulk action bar */}
      {selection.isSelectionMode && (
        <BulkActionBar
          selectionCount={selection.selectionCount}
          contexts={contexts}
          onChangeContext={(id) => handleBulkUpdate({ contextId: id }, "Context")}
          onChangeEnergy={(e) => handleBulkUpdate({ energyLevel: e }, "Energy")}
          onChangeTime={(m) => handleBulkUpdate({ estimatedMins: m }, "Time estimate")}
          onChangeStatus={(s) => handleBulkUpdate({ status: s }, "Status")}
          onChangeDueDate={(d) => handleBulkUpdate({ dueDate: d }, "Due date")}
          subProjects={subProjects.length > 0 ? subProjects : undefined}
          onMoveToSubProject={handleBulkMoveToSubProject}
          onCreateAndMove={handleBulkCreateAndMove}
          onDelete={handleBulkDelete}
          onDeselectAll={selection.deselectAll}
        />
      )}
    </div>
  );
}
