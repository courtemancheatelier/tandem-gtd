"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import type { ProjectTask, TeamMember } from "@/components/projects/ProjectTaskItem";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useUndo } from "@/contexts/UndoContext";
import { SaveAsTemplateDialog } from "@/components/projects/SaveAsTemplateDialog";
import { useSession } from "next-auth/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectOverviewTab } from "@/components/projects/ProjectOverviewTab";
import { ProjectOutlineTab } from "@/components/projects/ProjectOutlineTab";

import { ProjectThreadsTab } from "@/components/projects/ProjectThreadsTab";
import { ProjectDecisionsTab } from "@/components/projects/ProjectDecisionsTab";
import { ProjectEventsTab } from "@/components/events/ProjectEventsTab";

interface ChildProject {
  id: string;
  title: string;
  status: string;
  type: string;
  rollupProgress: number | null;
  sortOrder: number;
  version: number;
  _count?: { tasks: number; childProjects: number };
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
  startDate?: string | null;
  endDate?: string | null;
  velocityUnit?: "AUTO" | "TASKS" | "HOURS";
  depth?: number;
  version: number;
  area: { id: string; name: string } | null;
  goal: { id: string; title: string; horizon?: string } | null;
  parentProject?: { id: string; title: string } | null;
  team?: { id: string; name: string } | null;
  threadsEnabled?: boolean;
  decisionsEnabled?: boolean;
  eventsEnabled?: boolean;
  completionNotesEnabled?: boolean;
  outlineReady?: boolean;
  tasks: ProjectTask[];
  childProjects?: ChildProject[];
  externalLinkUrl?: string | null;
  externalLinkLabel?: string | null;
  purgeScheduledAt?: string | null;
  retentionExempt?: boolean;
  rsvpEvent?: { id: string } | null;
}

function getDefaultTab(project: ProjectDetail, projectId: string): string {
  try {
    const saved = localStorage.getItem(`project-tab-${projectId}`);
    if (saved) return saved;
  } catch {
    // ignore
  }
  const hasChildren = (project.childProjects?.length ?? 0) > 0;
  return project.outlineReady && hasChildren ? "outline" : "overview";
}

function saveTab(projectId: string, tab: string) {
  try {
    localStorage.setItem(`project-tab-${projectId}`, tab);
  } catch {
    // ignore
  }
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
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<{ id: string; title: string; depth: number }[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string>("__none__");
  const [conflictTaskId, setConflictTaskId] = useState<string | null>(null);
  const [conflictFields, setConflictFields] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [siblingProjects, setSiblingProjects] = useState<{ id: string; title: string }[]>([]);
  const [wikiArticles, setWikiArticles] = useState<{ slug: string; title: string }[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: session } = useSession();
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
      // Set default tab on first load
      if (!activeTab) {
        setActiveTab(getDefaultTab(projectData, projectId));
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
          // Non-critical
        }
        // Fetch wiki articles for this team
        try {
          const wikiRes = await fetch(`/api/wiki?teamId=${projectData.team.id}`);
          if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            setWikiArticles(
              (wikiData.articles || wikiData || []).map((a: { slug: string; title: string }) => ({
                slug: a.slug,
                title: a.title,
              }))
            );
          }
        } catch {
          // Non-critical
        }
      } else {
        setTeamMembers([]);
        setWikiArticles([]);
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
          // Non-critical
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

  // ─── Handlers ─────────────────────────────────────────────────

  async function handleTaskStatusChange(taskId: string, status: string) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status, version: task?.version }),
    });

    if (res.status === 409) {
      // Auto-retry with fresh version from server
      const conflict = await res.json();
      const retryRes = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status, version: conflict.currentVersion }),
      });
      if (retryRes.ok) {
        await fetchProject();
      } else {
        setConflictTaskId(taskId);
        setConflictFields(["status"]);
        toast({ title: "Conflict", description: "Updated by another user.", duration: 3000 });
        await fetchProject();
        setTimeout(() => { setConflictTaskId(null); setConflictFields([]); }, 4000);
      }
    } else if (res.ok) {
      await fetchProject();
    } else {
      toast({ title: "Error", description: "Failed to update task status", variant: "destructive" });
    }
  }

  async function handleCompleteTask(taskId: string, note?: string) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const taskTitle = task?.title ?? "Task";
    const previousStatus = task?.status ?? "NOT_STARTED";

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
        await fetchProject();
        return;
      }
      // Use retry response as the success path
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
          await fetchProject();
        },
      });
      if (retryCascade.recycledTasks?.length > 0) {
        const r = retryCascade.recycledTasks[0];
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

      if (cascade.recycledTasks?.length > 0) {
        const r = cascade.recycledTasks[0];
        const nextDate = new Date(String(r.nextDue).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        toast({ title: "Recurring task recycled", description: `Scheduled "${r.title}" for ${nextDate}` });
      }

      await fetchProject();
    } else {
      toast({ title: "Error", description: "Failed to complete task", variant: "destructive" });
    }
  }

  async function handleAddTask(title: string) {
    if (!project) return;
    const maxSortOrder = project.tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1);
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, sortOrder: maxSortOrder + 1 }),
    });
    if (res.ok) {
      await fetchProject();
      toast({ title: "Task added", description: title });
    } else {
      toast({ title: "Error", description: "Failed to add task", variant: "destructive" });
    }
  }

  async function handleAddTasks(titles: string[]) {
    if (!project) return;
    const maxSortOrder = project.tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1);
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

  async function handleUpdateTask(taskId: string, data: Record<string, unknown>) {
    const task = project?.tasks.find((t) => t.id === taskId);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, ...data, version: task?.version }),
    });

    if (res.status === 409) {
      const conflict = await res.json().catch(() => ({}));
      // Auto-retry with fresh version from server
      if (conflict.currentVersion) {
        const retryRes = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskId, ...data, version: conflict.currentVersion }),
        });
        if (retryRes.ok) {
          await fetchProject();
          return;
        }
      }
      // Retry failed — show conflict UI
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
      setTimeout(() => { setConflictTaskId(null); setConflictFields([]); }, 4000);
    } else if (res.ok) {
      await fetchProject();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error || "Failed to update task", variant: "destructive" });
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
      // Auto-retry with fresh version from server
      const conflict = await res.json();
      const retryRes = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, projectId: null, version: conflict.currentVersion }),
      });
      if (retryRes.ok) {
        await fetchProject();
        toast({ title: "Task removed from project" });
      } else {
        toast({ title: "Conflict", description: "Updated by another user.", duration: 3000 });
        await fetchProject();
      }
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
    try {
      // Create sub-project with the task's title
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

      // Delete the original task (the sub-project replaces it)
      const delRes = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
      if (!delRes.ok) {
        toast({ title: "Warning", description: "Sub-project created but original task could not be removed." });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
      return;
    }

    await fetchProject();
    toast({ title: "Converted to sub-project", description: taskTitle });
  }

  async function handleDemoteToTask(childId: string, childTitle: string) {
    try {
      // Create a task in the parent project with the sub-project's title
      const createRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: childTitle, projectId }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to create task", variant: "destructive" });
        return;
      }

      // Delete the empty sub-project
      const delRes = await fetch(`/api/projects/${childId}`, { method: "DELETE" });
      if (!delRes.ok) {
        toast({ title: "Warning", description: "Task created but sub-project could not be removed." });
      }
    } catch {
      toast({ title: "Error", description: "Failed to convert to task", variant: "destructive" });
      return;
    }

    await fetchProject();
    toast({ title: "Converted to task", description: childTitle });
  }

  async function handleUpdateProject(data: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, version: project?.version }),
    });
    if (res.status === 409) {
      // Auto-retry with fresh version from server
      const conflict = await res.json().catch(() => ({}));
      if (conflict.currentVersion) {
        const retryRes = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, version: conflict.currentVersion }),
        });
        if (retryRes.ok) {
          await fetchProject();
          toast({ title: "Project updated" });
          return;
        }
      }
      toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
      await fetchProject();
    } else if (res.ok) {
      await fetchProject();
      toast({ title: "Project updated" });
    } else {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    }
  }

  async function handleStatusChange(status: string, note?: string) {
    const updates: Record<string, unknown> = { status };
    if (status === "SOMEDAY_MAYBE") {
      updates.isSomedayMaybe = true;
    } else if (project?.status === "SOMEDAY_MAYBE") {
      updates.isSomedayMaybe = false;
    }
    if (note) updates.note = note;
    await handleUpdateProject(updates);
  }

  async function handleDelete() {
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Project deleted" });
      router.push("/projects");
    } else {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    }
  }

  async function handleAddSubProject(title: string) {
    const res = await fetch(`/api/projects/${projectId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      await fetchProject();
      toast({ title: "Sub-project created" });
    } else {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Error", description: data.error || "Failed to create sub-project", variant: "destructive" });
    }
  }

  async function openMoveDialog() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projects = await res.json();
        setAllProjects(
          projects.filter((p: { id: string; depth: number; path?: string }) =>
            p.id !== projectId &&
            !(p.path && p.path.includes(projectId + "/")) &&
            p.depth < 2
          )
        );
      }
    } catch {
      // Silently fail
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
      toast({ title: "Error", description: data.error || "Failed to move project", variant: "destructive" });
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
      toast({ title: "Error", description: data.error || "Failed to detach project", variant: "destructive" });
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
      // Auto-retry with fresh version from server
      const conflict = await res.json().catch(() => ({}));
      if (conflict.currentVersion) {
        const retryRes = await fetch(`/api/projects/${childId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED", version: conflict.currentVersion }),
        });
        if (retryRes.ok) {
          const data = await retryRes.json();
          const cascade = data.cascade;
          toast({ title: "Project completed" });
          if (cascade?.completedTasks?.length > 0) {
            toast({
              title: "Tasks completed",
              description: `${cascade.completedTasks.length} task${cascade.completedTasks.length !== 1 ? "s" : ""} completed`,
            });
          }
          await fetchProject();
          return;
        }
      }
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
      toast({ title: "Error", description: "Failed to complete project", variant: "destructive" });
    }
  }

  async function handleReorderTasks(orderedTaskIds: string[]) {
    if (!project) return;
    const taskMap = new Map(project.tasks.map((t) => [t.id, t]));
    const reordered = orderedTaskIds.map((id) => taskMap.get(id)).filter(Boolean) as ProjectTask[];
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

  async function handleReorderSubProjects(orderedChildIds: string[]) {
    if (!project) return;
    // Optimistic update
    const childMap = new Map((project.childProjects ?? []).map((c) => [c.id, c]));
    const reordered = orderedChildIds.map((id) => childMap.get(id)).filter(Boolean) as ChildProject[];
    const rest = (project.childProjects ?? []).filter((c) => !orderedChildIds.includes(c.id));
    setProject({ ...project, childProjects: [...reordered, ...rest] });

    try {
      const res = await fetch(`/api/projects/${projectId}/children/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childIds: orderedChildIds }),
      });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to reorder sub-projects", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to reorder sub-projects", variant: "destructive" });
    }
    await fetchProject();
  }

  // ─── Render ───────────────────────────────────────────────────

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

  const hasChildProjects = (project.childProjects?.length ?? 0) > 0;
  const showThreadsTab = project.team && project.threadsEnabled !== false && session?.user?.id;
  const showDecisionsTab = project.team && project.decisionsEnabled !== false && session?.user?.id;
  const showEventsTab = session?.user?.id;

  return (
    <div className="space-y-2">
      <ProjectHeader
        project={project}
        taskCounts={taskCounts}
        hasChildren={hasChildProjects || (project.depth ?? 0) < 2}
        goals={goals}
        areas={areas}
        onUpdateProject={handleUpdateProject}
        onStatusChange={handleStatusChange}
        isTeamProject={!!project.team}
        onDelete={handleDelete}
        onMoveProject={openMoveDialog}
        onMakeStandalone={project.parentProject ? handleMakeStandalone : undefined}
        onSaveAsTemplate={() => setTemplateDialogOpen(true)}
        onExemptFromPurge={project.purgeScheduledAt ? handleExemptFromPurge : undefined}
        flowHref={`/projects/${projectId}/flow`}
        parentProject={project.parentProject}
        outlineReady={project.outlineReady}
        hasChildProjects={hasChildProjects}
      />

      <Tabs
        value={activeTab || "overview"}
        onValueChange={(tab) => {
          setActiveTab(tab);
          saveTab(projectId, tab);
        }}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
          {showThreadsTab && (
            <TabsTrigger value="threads">Threads</TabsTrigger>
          )}
          {showDecisionsTab && (
            <TabsTrigger value="decisions">Decisions</TabsTrigger>
          )}
          {showEventsTab && (
            <TabsTrigger value="event">Event</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-2">
            <ProjectOverviewTab
              project={project}
              contexts={contexts}
              teamMembers={teamMembers}
              siblingProjects={siblingProjects}
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
              onAddSubProject={handleAddSubProject}
              onCompleteChildProject={handleCompleteChildProject}
              onDemoteToTask={handleDemoteToTask}
              onReorderSubProjects={handleReorderSubProjects}
              onRefresh={fetchProject}
              conflictTaskId={conflictTaskId}
              conflictFields={conflictFields}
            />
          </div>
        </TabsContent>

        <TabsContent value="outline">
          <ProjectOutlineTab
            projectId={projectId}
            onDataChange={fetchProject}
          />
        </TabsContent>

        {showThreadsTab && (
          <TabsContent value="threads">
            <ProjectThreadsTab
              projectId={projectId}
              currentUserId={session!.user!.id!}
              members={teamMembers.map((m) => ({ id: m.id, name: m.name || m.email }))}
            />
          </TabsContent>
        )}

        {showDecisionsTab && (
          <TabsContent value="decisions">
            <ProjectDecisionsTab
              projectId={projectId}
              currentUserId={session!.user!.id!}
              members={teamMembers.map((m) => ({ id: m.id, name: m.name || m.email }))}
              tasks={project.tasks.map((t) => ({ id: t.id, title: t.title }))}
              wikiArticles={wikiArticles}
            />
          </TabsContent>
        )}

        {showEventsTab && (
          <TabsContent value="event">
            <div className="rounded-lg border p-4">
              <ProjectEventsTab
                projectId={projectId}
                currentUserId={session!.user!.id!}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>

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
