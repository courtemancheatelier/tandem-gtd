"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Plus, FolderTree, ChevronRight, ArrowUpDown, ArrowUpToLine, GripVertical } from "lucide-react";
import { StatusCircle } from "@/components/shared/StatusCircle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { ProjectBurnDown } from "@/components/projects/ProjectBurnDown";
import { ProjectTaskList } from "@/components/projects/ProjectTaskList";
import { ProjectActivity } from "@/components/projects/ProjectActivity";
import type { ProjectTask, TeamMember } from "@/components/projects/ProjectTaskItem";
import { useSelection } from "@/lib/hooks/use-selection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";

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

interface ProjectOverviewTabProps {
  project: {
    id: string;
    title: string;
    status: string;
    type: string;
    childType?: string;
    depth?: number;
    version: number;
    team?: { id: string; name: string } | null;
    threadsEnabled?: boolean;
    completionNotesEnabled?: boolean;
    parentProject?: { id: string; title: string } | null;
    velocityUnit?: "AUTO" | "TASKS" | "HOURS";
    tasks: ProjectTask[];
    childProjects?: ChildProject[];
  };
  contexts: { id: string; name: string; color: string | null }[];
  teamMembers: TeamMember[];
  siblingProjects: { id: string; title: string }[];
  onComplete: (taskId: string, note?: string) => Promise<void>;
  onStatusChange: (taskId: string, status: string) => Promise<void>;
  onAddTask: (title: string) => Promise<void>;
  onAddMultipleTasks: (titles: string[]) => Promise<void>;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDetachTask: (taskId: string) => Promise<void>;
  onPromoteToSubProject?: (taskId: string, title: string) => Promise<void>;
  onUncompleteTask: (taskId: string) => Promise<void>;
  onReorderTasks: (orderedTaskIds: string[]) => Promise<void>;
  onAddSubProject: (title: string) => Promise<void>;
  onCompleteChildProject: (childId: string) => Promise<void>;
  onDemoteToTask?: (childId: string, childTitle: string) => Promise<void>;
  onReorderSubProjects?: (orderedChildIds: string[]) => Promise<void>;
  onRefresh: () => Promise<void>;
  conflictTaskId: string | null;
  conflictFields: string[];
}

export function ProjectOverviewTab({
  project,
  contexts,
  teamMembers,
  siblingProjects,
  onComplete,
  onStatusChange,
  onAddTask,
  onAddMultipleTasks,
  onUpdateTask,
  onDeleteTask,
  onDetachTask,
  onPromoteToSubProject,
  onUncompleteTask,
  onReorderTasks,
  onAddSubProject,
  onCompleteChildProject,
  onDemoteToTask,
  onReorderSubProjects,
  onRefresh,
  conflictTaskId,
  conflictFields,
}: ProjectOverviewTabProps) {
  const { toast } = useToast();
  const [subProjectsExpanded, setSubProjectsExpanded] = useState(
    project.tasks.length === 0 && (project.childProjects?.length ?? 0) > 0
  );
  const [showAddSubProject, setShowAddSubProject] = useState(false);
  const [newSubProjectTitle, setNewSubProjectTitle] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [subProjectReorderMode, setSubProjectReorderMode] = useState(false);
  const [taskSort, setTaskSort] = useState<"manual" | "status">("manual");

  // Sub-project drag state
  const [spDragIndex, setSpDragIndex] = useState<number | null>(null);
  const [spDragOverIndex, setSpDragOverIndex] = useState<number | null>(null);
  const spDragCounter = useRef(0);

  const activeChildProjects = (project.childProjects ?? []).filter(
    (c) => c.status !== "COMPLETED" && c.status !== "DROPPED"
  );
  const showSpDragHandles = !!onReorderSubProjects && subProjectReorderMode && activeChildProjects.length > 1;

  const handleSpDragStart = useCallback((idx: number) => {
    setSpDragIndex(idx);
    spDragCounter.current = 0;
  }, []);

  const handleSpDragEnter = useCallback((idx: number) => {
    spDragCounter.current++;
    setSpDragOverIndex(idx);
  }, []);

  const handleSpDragLeave = useCallback(() => {
    spDragCounter.current--;
    if (spDragCounter.current <= 0) {
      setSpDragOverIndex(null);
      spDragCounter.current = 0;
    }
  }, []);

  const handleSpDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleSpDrop = useCallback(
    (dropIdx: number) => {
      if (spDragIndex === null || spDragIndex === dropIdx || !onReorderSubProjects) {
        setSpDragIndex(null);
        setSpDragOverIndex(null);
        return;
      }
      const children = project.childProjects ?? [];
      const newOrder = [...children];
      const [moved] = newOrder.splice(spDragIndex, 1);
      newOrder.splice(dropIdx, 0, moved);
      onReorderSubProjects(newOrder.map((c) => c.id));
      setSpDragIndex(null);
      setSpDragOverIndex(null);
    },
    [spDragIndex, project.childProjects, onReorderSubProjects]
  );

  const handleSpDragEnd = useCallback(() => {
    setSpDragIndex(null);
    setSpDragOverIndex(null);
    spDragCounter.current = 0;
  }, []);

  const projectId = project.id;

  const activeTasks = project.tasks.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
  );
  const selection = useSelection({ items: activeTasks });

  const statusOrder: Record<string, number> = { IN_PROGRESS: 0, NOT_STARTED: 1, ON_HOLD: 2, COMPLETED: 3, DROPPED: 4 };
  const projectRef = { id: project.id, title: project.title, type: project.type, team: project.team ?? undefined };
  const enrichedTasks = project.tasks.map((t) => ({
    ...t,
    project: projectRef,
  }));

  const sortedTasks = taskSort === "status"
    ? [...enrichedTasks].sort((a, b) => {
        const diff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        return diff !== 0 ? diff : a.sortOrder - b.sortOrder;
      })
    : enrichedTasks;

  async function handleAddSubProject() {
    if (!newSubProjectTitle.trim()) return;
    await onAddSubProject(newSubProjectTitle.trim());
    setNewSubProjectTitle("");
    setShowAddSubProject(false);
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
      await onRefresh();
    } else {
      toast({ title: "Error", description: "Failed to update tasks", variant: "destructive" });
    }
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
      await onRefresh();
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
        toast({ title: "Error", description: data.error || "Failed to create sub-project", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create sub-project", variant: "destructive" });
    }
  }

  return (
    <>
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
            <div className="flex items-center gap-2">
              {onReorderSubProjects && (project.childProjects?.length ?? 0) > 1 && (
                <button
                  onClick={() => setSubProjectReorderMode(!subProjectReorderMode)}
                  className={cn(
                    "flex items-center gap-1 text-xs transition-colors",
                    subProjectReorderMode
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {subProjectReorderMode ? "Done" : "Reorder"}
                </button>
              )}
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
                      className={cn(
                        "group/child flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors",
                        spDragIndex === idx && "opacity-50",
                        spDragOverIndex === idx && spDragIndex !== idx && "border-t-2 border-primary",
                      )}
                      draggable={showSpDragHandles}
                      onDragStart={showSpDragHandles ? () => handleSpDragStart(idx) : undefined}
                      onDragEnter={showSpDragHandles ? () => handleSpDragEnter(idx) : undefined}
                      onDragLeave={showSpDragHandles ? handleSpDragLeave : undefined}
                      onDragOver={showSpDragHandles ? handleSpDragOver : undefined}
                      onDrop={showSpDragHandles ? () => handleSpDrop(idx) : undefined}
                      onDragEnd={showSpDragHandles ? handleSpDragEnd : undefined}
                    >
                      {showSpDragHandles && (
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                      )}
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
                        onClick={() => onCompleteChildProject(child.id)}
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
                      {onDemoteToTask && (child._count?.tasks ?? 0) === 0 && (child._count?.childProjects ?? 0) === 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDemoteToTask(child.id, child.title);
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/child:opacity-100"
                          title="Convert to task"
                        >
                          <ArrowUpToLine className="h-3.5 w-3.5" />
                        </button>
                      )}
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
          onComplete={onComplete}
          onStatusChange={onStatusChange}
          onAddTask={onAddTask}
          onAddMultipleTasks={onAddMultipleTasks}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onDetachTask={onDetachTask}
          onPromoteToSubProject={(project.depth ?? 0) < 2 ? onPromoteToSubProject : undefined}
          onMoveToSubProject={(project.childProjects?.length ?? 0) > 0
            ? (taskId: string, subProjectId: string) => onUpdateTask(taskId, { projectId: subProjectId })
            : undefined
          }
          subProjects={(project.childProjects ?? []).map((c) => ({ id: c.id, title: c.title }))}
          onUncompleteTask={onUncompleteTask}
          onReorderTasks={onReorderTasks}
          reorderMode={reorderMode}
          contexts={contexts}
          teamMembers={teamMembers}
          teamId={project.team?.id}
          teamInfo={project.team ? { id: project.team.id, name: project.team.name, completionNotesEnabled: project.completionNotesEnabled } : null}
          isSelected={selection.isSelected}
          onToggleSelect={selection.toggle}
          conflictTaskId={conflictTaskId}
          conflictFields={conflictFields}
        />
      </div>

      {/* Project Activity */}
      <div className="mt-6 rounded-lg border p-4">
        <ProjectActivity
          projectId={projectId}
          tasks={project.tasks.map((t) => ({ id: t.id, title: t.title }))}
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
    </>
  );
}
