"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { ProjectTaskList } from "@/components/projects/ProjectTaskList";
import type { ProjectTask, TeamMember } from "@/components/projects/ProjectTaskItem";
import { Loader2, Plus, FolderTree, ChevronRight, ArrowUpDown } from "lucide-react";
import { StatusCircle } from "@/components/shared/StatusCircle";
import { useSelection } from "@/lib/hooks/use-selection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUndo } from "@/contexts/UndoContext";
import { ProjectBurnDown } from "@/components/projects/ProjectBurnDown";
import { SaveAsTemplateDialog } from "@/components/projects/SaveAsTemplateDialog";

interface ChildProject {
  id: string;
  title: string;
  status: string;
  type: string;
  rollupProgress: number | null;
  sortOrder: number;
  version: number;
}

interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  childType?: string;
  outcome: string | null;
  targetDate?: string | null;
  velocityUnit?: "AUTO" | "TASKS" | "HOURS";
  depth?: number;
  version: number;
  area: { id: string; name: string } | null;
  goal: { id: string; title: string; horizon?: string } | null;
  parentProject?: { id: string; title: string } | null;
  team?: { id: string; name: string } | null;
  tasks: ProjectTask[];
  childProjects?: ChildProject[];
  purgeScheduledAt?: string | null;
  retentionExempt?: boolean;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { push: pushUndo } = useUndo();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [contexts, setContexts] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<{ id: string; title: string; horizon: string }[]>([]);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [showAddSubProject, setShowAddSubProject] = useState(false);
  const [newSubProjectTitle, setNewSubProjectTitle] = useState("");
  const [subProjectsExpanded, setSubProjectsExpanded] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<{ id: string; title: string; depth: number }[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string>("__none__");
  const [conflictTaskId, setConflictTaskId] = useState<string | null>(null);
  const [conflictFields, setConflictFields] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
  const [taskSort, setTaskSort] = useState<"manual" | "status">("manual");
  const [siblingProjects, setSiblingProjects] = useState<{ id: string; title: string }[]>([]);

  const projectId = params.id as string;

  const fetchProject = useCallback(async () => {
    try {
      const [projectRes, contextsRes, goalsRes, areasRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch("/api/contexts"),
        fetch("/api/goals"),
        fetch("/api/areas?active=true"),
      ]);
      if (!projectRes.ok) {
        if (projectRes.status === 404) {
          setError("Project not found");
        } else {
          setError("Failed to load project");
        }
        return;
      }
      const projectData = await projectRes.json();
      setProject(projectData);
      if (contextsRes.ok) {
        setContexts(await contextsRes.json());
      }
      if (goalsRes.ok) {
        setGoals(await goalsRes.json());
      }
      if (areasRes.ok) {
        setAreas(await areasRes.json());
      }
      // Auto-expand sub-projects if project has no tasks but has children
      if (projectData.tasks.length === 0 && projectData.childProjects?.length > 0) {
        setSubProjectsExpanded(true);
      }
      // Fetch team members if this is a team project
      if (projectData.team?.id) {
        try {
          const teamRes = await fetch(`/api/teams/${projectData.team.id}`);
          if (teamRes.ok) {
            const teamData = await teamRes.json();
            setTeamMembers(
              (teamData.members || []).map((m: { user: { id: string; name: string | null; email: string } }) => ({
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
              }))
            );
          }
        } catch {
          // Non-critical — assignment UI just won't appear
        }
      } else {
        setTeamMembers([]);
      }
      // Fetch sibling sub-projects if this is a sub-project
      if (projectData.parentProject?.id) {
        try {
          const parentRes = await fetch(`/api/projects/${projectData.parentProject.id}`);
          if (parentRes.ok) {
            const parentData = await parentRes.json();
            setSiblingProjects(
              (parentData.childProjects || [])
                .filter((c: { id: string }) => c.id !== projectId)
                .map((c: { id: string; title: string }) => ({ id: c.id, title: c.title }))
            );
          }
        } catch {
          // Non-critical — sibling move options just won't appear
        }
      } else {
        setSiblingProjects([]);
      }
      setError(null);
      // Refresh burn-down if section is open
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refreshFn = (window as any)[`__burndown_refresh_${projectId}`];
      if (typeof refreshFn === "function") refreshFn();
    } catch {
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  async function handleTaskStatusChange(taskId: string, status: string) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status, version: task?.version }),
    });

    if (res.status === 409) {
      setConflictTaskId(taskId);
      setConflictFields(["status"]);
      toast({ title: "Conflict", description: "Updated by another user.", duration: 3000 });
      await fetchProject();
      setTimeout(() => { setConflictTaskId(null); setConflictFields([]); }, 4000);
    } else if (res.ok) {
      await fetchProject();
    } else {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    }
  }

  async function handleCompleteTask(taskId: string) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const taskTitle = task?.title ?? "Task";
    const previousStatus = task?.status ?? "NOT_STARTED";

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      await fetchProject();
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
          await fetchProject();
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

      await fetchProject();
    } else {
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive",
      });
    }
  }

  async function handleAddTask(title: string) {
    if (!project) return;

    // Calculate next sort order
    const maxSortOrder = project.tasks.reduce(
      (max, t) => Math.max(max, t.sortOrder),
      -1
    );

    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        sortOrder: maxSortOrder + 1,
      }),
    });

    if (res.ok) {
      await fetchProject();
      toast({
        title: "Task added",
        description: title,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to add task",
        variant: "destructive",
      });
    }
  }

  async function handleAddTasks(titles: string[]) {
    if (!project) return;

    const maxSortOrder = project.tasks.reduce(
      (max, t) => Math.max(max, t.sortOrder),
      -1
    );

    const results = await Promise.allSettled(
      titles.map((title, i) =>
        fetch(`/api/projects/${projectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, sortOrder: maxSortOrder + 1 + i }),
        })
      )
    );

    const created = results.filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<Response>).value.ok).length;
    await fetchProject();
    if (created > 0) {
      toast({ title: `Created ${created} task${created !== 1 ? "s" : ""}` });
    } else {
      toast({ title: "Error", description: "Failed to create tasks", variant: "destructive" });
    }
  }

  async function handleUpdateTask(
    taskId: string,
    data: Record<string, unknown>
  ) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, ...data, version: task?.version }),
    });

    if (res.status === 409) {
      const conflict = await res.json().catch(() => ({}));
      // Determine which fields differ between local task and server state
      const changed: string[] = [];
      if (conflict.currentState && task) {
        const serverState = conflict.currentState as Record<string, unknown>;
        for (const key of ["title", "notes", "status", "energyLevel", "estimatedMins", "dueDate", "contextId"]) {
          const local = (task as unknown as Record<string, unknown>)[key] ?? null;
          const server = serverState[key] ?? null;
          if (String(local) !== String(server)) changed.push(key);
        }
      }
      setConflictTaskId(taskId);
      setConflictFields(changed.length > 0 ? changed : Object.keys(data));
      const serverStatus = (conflict.currentState as Record<string, unknown>)?.status;
      const isCompleted = serverStatus === "COMPLETED" || serverStatus === "DROPPED";
      toast({
        title: isCompleted ? "Task completed" : "Conflict",
        description: isCompleted ? "This task was already completed by another user." : "Updated by another user.",
        duration: 3000,
      });
      await fetchProject();
      // Clear highlights after a few seconds
      setTimeout(() => { setConflictTaskId(null); setConflictFields([]); }, 4000);
    } else if (res.ok) {
      await fetchProject();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({
        title: "Error",
        description: err.error || "Failed to update task",
        variant: "destructive",
      });
    }
  }

  async function handleDeleteTask(taskId: string) {
    const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchProject();
      toast({ title: "Task deleted" });
    } else {
      toast({ title: "Error", description: "Failed to delete task", variant: "destructive" });
    }
  }

  async function handleDetachTask(taskId: string) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, projectId: null, version: task?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "Updated by another user.", duration: 3000 });
      await fetchProject();
    } else if (res.ok) {
      await fetchProject();
      toast({ title: "Task removed from project" });
    } else {
      toast({ title: "Error", description: "Failed to remove task from project", variant: "destructive" });
    }
  }

  async function handleUncompleteTask(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/uncomplete`, { method: "POST" });
    if (res.ok) {
      await fetchProject();
      toast({ title: "Task reopened" });
    } else {
      toast({ title: "Error", description: "Failed to reopen task", variant: "destructive" });
    }
  }

  async function handlePromoteToSubProject(taskId: string, taskTitle: string) {
    // Step 1: Create a sub-project with the task title
    let newProjectId: string | null = null;
    try {
      const createRes = await fetch(`/api/projects/${projectId}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to create sub-project", variant: "destructive" });
        return;
      }
      const newProject = await createRes.json();
      newProjectId = newProject.id;
    } catch {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
      return;
    }

    // Step 2: Move the task into the new sub-project
    const task = project?.tasks.find((t) => t.id === taskId);
    const moveRes = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, projectId: newProjectId, version: task?.version }),
    });

    if (!moveRes.ok) {
      toast({ title: "Warning", description: "Sub-project created but task could not be moved. Please move it manually." });
    }

    await fetchProject();
    setSubProjectsExpanded(true);
    toast({ title: "Task promoted to sub-project", description: taskTitle });
  }

  async function handleUpdateProject(data: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, version: project?.version }),
    });

    if (res.status === 409) {
      toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
      await fetchProject();
    } else if (res.ok) {
      await fetchProject();
      toast({
        title: "Project updated",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to update project",
        variant: "destructive",
      });
    }
  }

  async function handleStatusChange(status: string) {
    const updates: Record<string, unknown> = { status };
    if (status === "SOMEDAY_MAYBE") {
      updates.isSomedayMaybe = true;
    } else if (project?.status === "SOMEDAY_MAYBE") {
      updates.isSomedayMaybe = false;
    }
    await handleUpdateProject(updates);
  }

  async function handleDelete() {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast({
        title: "Project deleted",
      });
      router.push("/projects");
    } else {
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  }

  async function handleAddSubProject() {
    if (!newSubProjectTitle.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubProjectTitle.trim() }),
    });
    if (res.ok) {
      setNewSubProjectTitle("");
      setShowAddSubProject(false);
      await fetchProject();
      toast({ title: "Sub-project created" });
    } else {
      const data = await res.json().catch(() => ({}));
      toast({
        title: "Error",
        description: data.error || "Failed to create sub-project",
        variant: "destructive",
      });
    }
  }

  async function openMoveDialog() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projects = await res.json();
        // Filter out: self, own descendants, and projects at max depth
        setAllProjects(
          projects.filter((p: { id: string; depth: number; path?: string }) =>
            p.id !== projectId &&
            !(p.path && p.path.includes(projectId + "/")) &&
            p.depth < 2
          )
        );
      }
    } catch {
      // Silently fail — dialog will show empty list
    }
    setMoveTargetId("__none__");
    setMoveDialogOpen(true);
  }

  async function handleMoveProject() {
    const newParentId = moveTargetId === "__none__" ? null : moveTargetId;
    const res = await fetch(`/api/projects/${projectId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newParentId }),
    });
    if (res.ok) {
      setMoveDialogOpen(false);
      await fetchProject();
      toast({
        title: newParentId ? "Project moved" : "Project detached",
        description: newParentId
          ? `Moved under "${allProjects.find((p) => p.id === newParentId)?.title}"`
          : "Project is now standalone",
      });
    } else {
      const data = await res.json().catch(() => ({}));
      toast({
        title: "Error",
        description: data.error || "Failed to move project",
        variant: "destructive",
      });
    }
  }

  async function handleExemptFromPurge() {
    const res = await fetch(`/api/projects/${projectId}/retention`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionExempt: true }),
    });
    if (res.ok) {
      await fetchProject();
      toast({ title: "Project exempted from retention" });
    } else {
      toast({ title: "Error", description: "Failed to exempt project", variant: "destructive" });
    }
  }

  async function handleMakeStandalone() {
    const res = await fetch(`/api/projects/${projectId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newParentId: null }),
    });
    if (res.ok) {
      await fetchProject();
      toast({ title: "Project detached", description: "Project is now standalone" });
    } else {
      const data = await res.json().catch(() => ({}));
      toast({
        title: "Error",
        description: data.error || "Failed to detach project",
        variant: "destructive",
      });
    }
  }

  async function handleCompleteChildProject(childId: string) {
    const child = project?.childProjects?.find((c) => c.id === childId);
    const res = await fetch(`/api/projects/${childId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED", version: child?.version }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
      await fetchProject();
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
      await fetchProject();
    } else {
      toast({
        title: "Error",
        description: "Failed to complete project",
        variant: "destructive",
      });
    }
  }

  // Selection for bulk operations — only active tasks
  const activeTasks = (project?.tasks ?? []).filter(
    (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
  );
  const selection = useSelection({ items: activeTasks });

  // Status-based sort for PARALLEL / SINGLE_ACTIONS projects
  const statusOrder: Record<string, number> = { IN_PROGRESS: 0, NOT_STARTED: 1, ON_HOLD: 2, COMPLETED: 3, DROPPED: 4 };
  const sortedTasks = taskSort === "status"
    ? [...(project?.tasks ?? [])].sort((a, b) => {
        const diff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        return diff !== 0 ? diff : a.sortOrder - b.sortOrder;
      })
    : project?.tasks ?? [];

  async function handleReorderTasks(orderedTaskIds: string[]) {
    if (!project) return;
    // Optimistic update: reorder tasks in local state
    const taskMap = new Map(project.tasks.map((t) => [t.id, t]));
    const reordered = orderedTaskIds
      .map((id) => taskMap.get(id))
      .filter(Boolean) as ProjectTask[];
    // Keep tasks not in the reorder list (completed/dropped) at the end
    const rest = project.tasks.filter((t) => !orderedTaskIds.includes(t.id));
    setProject({ ...project, tasks: [...reordered, ...rest] });

    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/reorder`, {
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
    await fetchProject();
  }

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
      await fetchProject();
    } else {
      toast({ title: "Error", description: "Failed to delete tasks", variant: "destructive" });
    }
  }

  async function handleMoveToSubProject(subProjectId: string) {
    await handleBulkUpdate({ projectId: subProjectId }, "Project");
  }

  async function handleCreateAndMove(title: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const newProject = await res.json();
        await handleMoveToSubProject(newProject.id);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Error",
          description: data.error || "Failed to create sub-project",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
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
      await fetchProject();
    } else {
      toast({ title: "Error", description: "Failed to update tasks", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-muted-foreground">{error || "Project not found"}</p>
        <button
          onClick={() => router.push("/projects")}
          className="text-sm text-primary hover:underline"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const taskCounts = {
    total: project.tasks.length,
    completed: project.tasks.filter(
      (t) => t.status === "COMPLETED" || t.status === "DROPPED"
    ).length,
  };

  return (
    <div className="space-y-2">
      <ProjectHeader
        project={project}
        taskCounts={taskCounts}
        hasChildren={(project.childProjects?.length ?? 0) > 0 || (project.depth ?? 0) < 2}
        goals={goals}
        areas={areas}
        onUpdateProject={handleUpdateProject}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        onMoveProject={openMoveDialog}
        onMakeStandalone={project.parentProject ? handleMakeStandalone : undefined}
        onSaveAsTemplate={() => setTemplateDialogOpen(true)}
        onExemptFromPurge={project.purgeScheduledAt ? handleExemptFromPurge : undefined}
        flowHref={`/projects/${projectId}/flow`}
        parentProject={project.parentProject}
      />

      {/* Charts Section */}
      <ProjectBurnDown projectId={projectId} projectTitle={project.title} velocityUnit={project.velocityUnit} />

      {/* Sub-Projects Section */}
      {(project.childProjects && project.childProjects.length > 0) ||
      (project.depth ?? 0) < 2 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setSubProjectsExpanded(!subProjectsExpanded)}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", subProjectsExpanded && "rotate-90")} />
              <FolderTree className="h-4 w-4" />
              Sub-Projects
              {project.childProjects && project.childProjects.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  ({project.childProjects.length})
                </span>
              )}
            </button>
            {(project.depth ?? 0) < 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const willShow = !showAddSubProject;
                  setShowAddSubProject(willShow);
                  if (willShow) setSubProjectsExpanded(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            )}
          </div>

          {subProjectsExpanded && (
            <>
              {showAddSubProject && (
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newSubProjectTitle}
                    onChange={(e) => setNewSubProjectTitle(e.target.value)}
                    placeholder="Sub-project title..."
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSubProject();
                      if (e.key === "Escape") setShowAddSubProject(false);
                    }}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleAddSubProject}>
                    Create
                  </Button>
                </div>
              )}

              {project.childProjects && project.childProjects.length > 0 && (
                <div className="space-y-1 mb-4">
                  {project.childProjects.map((child, idx) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      {(project.childType || "SEQUENTIAL") === "SEQUENTIAL" && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 shrink-0 font-mono tabular-nums",
                            child.status === "ACTIVE" && "border-green-500 text-green-700 dark:text-green-400",
                            child.status === "COMPLETED" && "border-blue-500 text-blue-700 dark:text-blue-400",
                            child.status === "ON_HOLD" && "border-muted-foreground/40 text-muted-foreground",
                            child.status === "DROPPED" && "border-muted-foreground/40 text-muted-foreground",
                          )}
                        >
                          {idx + 1}/{project.childProjects!.length}
                        </Badge>
                      )}
                      <StatusCircle
                        status={child.status}
                        onClick={() => handleCompleteChildProject(child.id)}
                        disabled={child.status === "COMPLETED" || child.status === "DROPPED"}
                      />
                      <Link
                        href={`/projects/${child.id}`}
                        className="text-sm font-medium flex-1 truncate hover:underline"
                      >
                        {child.title}
                      </Link>
                      {child.rollupProgress != null && (
                        <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.min(child.rollupProgress, 100)}%`,
                            }}
                          />
                        </div>
                      )}
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] px-1 py-0",
                          child.status === "ACTIVE" && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                          child.status === "ON_HOLD" && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                          child.status === "COMPLETED" && "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                          child.status === "DROPPED" && "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
                        )}
                      >
                        {child.status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-muted-foreground">Tasks</h2>
          {activeTasks.length > 1 && (
            <div className="flex items-center gap-3">
              {taskSort !== "status" && (
                <button
                  onClick={() => setReorderMode(!reorderMode)}
                  className={cn(
                    "flex items-center gap-1 text-xs transition-colors",
                    reorderMode
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {reorderMode ? "Done" : "Reorder"}
                </button>
              )}
              {project.type !== "SEQUENTIAL" && (
                <button
                  onClick={() => {
                    const next = taskSort === "manual" ? "status" : "manual";
                    setTaskSort(next);
                    if (next === "status") setReorderMode(false);
                  }}
                  className={cn(
                    "text-xs transition-colors",
                    taskSort === "status"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {taskSort === "status" ? "Sort: Status" : "Sort"}
                </button>
              )}
              <button
                onClick={selection.isSelectionMode ? selection.deselectAll : selection.selectAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {selection.isSelectionMode ? "Deselect all" : "Select all"}
              </button>
            </div>
          )}
          {activeTasks.length === 1 && (
            <button
              onClick={selection.isSelectionMode ? selection.deselectAll : selection.selectAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {selection.isSelectionMode ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
        <ProjectTaskList
          tasks={sortedTasks}
          projectType={project.type}
          projectStatus={project.status}
          onComplete={handleCompleteTask}
          onStatusChange={handleTaskStatusChange}
          onAddTask={handleAddTask}
          onAddMultipleTasks={handleAddTasks}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onDetachTask={handleDetachTask}
          onPromoteToSubProject={(project.depth ?? 0) < 2 ? handlePromoteToSubProject : undefined}
          onUncompleteTask={handleUncompleteTask}
          onReorderTasks={handleReorderTasks}
          reorderMode={reorderMode}
          contexts={contexts}
          teamMembers={teamMembers}
          teamId={project.team?.id}
          isSelected={selection.isSelected}
          onToggleSelect={selection.toggle}
          conflictTaskId={conflictTaskId}
          conflictFields={conflictFields}
        />
      </div>

      {selection.isSelectionMode && (
        <BulkActionBar
          selectionCount={selection.selectionCount}
          contexts={contexts}
          onChangeContext={(id) => handleBulkUpdate({ contextId: id }, "Context")}
          onChangeEnergy={(e) => handleBulkUpdate({ energyLevel: e }, "Energy")}
          onChangeTime={(m) => handleBulkUpdate({ estimatedMins: m }, "Time estimate")}
          onChangeStatus={(s) => handleBulkUpdate({ status: s }, "Status")}
          onChangeDueDate={(d) => handleBulkUpdate({ dueDate: d }, "Due date")}
          teamMembers={teamMembers.length > 0 ? teamMembers : undefined}
          onChangeAssignee={teamMembers.length > 0 ? (id) => handleBulkUpdate({ assignedToId: id }, "Assignee") : undefined}
          parentProject={project.parentProject ?? undefined}
          siblingProjects={siblingProjects.length > 0 ? siblingProjects : undefined}
          subProjects={(project.depth ?? 0) < 2 ? (project.childProjects ?? []).map((c) => ({ id: c.id, title: c.title })) : undefined}
          onMoveToSubProject={(project.depth ?? 0) < 2 || project.parentProject ? handleMoveToSubProject : undefined}
          onCreateAndMove={(project.depth ?? 0) < 2 ? handleCreateAndMove : undefined}
          onDelete={handleBulkDelete}
          onDeselectAll={selection.deselectAll}
        />
      )}

      {/* Move Project Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Project</DialogTitle>
            <DialogDescription>
              Choose a parent project to nest &ldquo;{project.title}&rdquo; under, or select &ldquo;None&rdquo; to make it standalone.
            </DialogDescription>
          </DialogHeader>
          <Select value={moveTargetId} onValueChange={setMoveTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select parent project..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (standalone)</SelectItem>
              {allProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {"  ".repeat(p.depth)}{p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMoveProject}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaveAsTemplateDialog
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        project={{
          id: project.id,
          title: project.title,
          type: project.type,
          taskCount: taskCounts.total,
          childProjectCount: project.childProjects?.length ?? 0,
        }}
      />
    </div>
  );
}
