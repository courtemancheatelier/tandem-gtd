"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TeamIcon } from "@/components/teams/team-icons";
import { Badge } from "@/components/ui/badge";

import { StatusCircle } from "@/components/shared/StatusCircle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight,
  ArrowRight,
  Layers,
  ListChecks,
  Star,
  Clock,
  Battery,
  BatteryMedium,
  BatteryFull,
  Plus,
} from "lucide-react";

export interface OutlineTask {
  id: string;
  title: string;
  status: string;
  isNextAction: boolean;
  sortOrder: number;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  dueDate?: string | null;
  version: number;
  context?: { id: string; name: string; color: string | null } | null;
}

export interface OutlineProject {
  id: string;
  title: string;
  status: string;
  type: string;
  childType?: string;
  sortOrder?: number;
  rollupProgress: number | null;
  isSomedayMaybe: boolean;
  version: number;
  area: { id: string; name: string } | null;
  team?: { id: string; name: string; icon?: string | null } | null;
  taskCounts: { total: number; active: number; completed: number };
  tasks: OutlineTask[];
  childProjects: OutlineProject[];
}

export interface OutlineActions {
  expandAll: () => void;
  collapseAll: () => void;
  isAllExpanded: boolean;
}

interface MasterOutlineViewProps {
  projects: OutlineProject[];
  onCompleteTask: (taskId: string) => void;
  onCompleteProject?: (projectId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onAddTask: (projectId: string, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onTeamFilter?: (teamId: string) => void;
  onAreaFilter?: (areaId: string) => void;
  autoExpandAll?: boolean;
  loading?: boolean;
  actionsRef?: React.MutableRefObject<OutlineActions | null>;
}

const STORAGE_KEY = "outline-expanded-ids";

const typeIcons: Record<string, React.ReactNode> = {
  SEQUENTIAL: <ArrowRight className="h-3 w-3" />,
  PARALLEL: <Layers className="h-3 w-3" />,
  SINGLE_ACTIONS: <ListChecks className="h-3 w-3" />,
};

const typeLabels: Record<string, string> = {
  SEQUENTIAL: "Sequential",
  PARALLEL: "Parallel",
  SINGLE_ACTIONS: "Single Actions",
};

function EnergyDot({ level }: { level: string }) {
  const icons: Record<string, React.ReactNode> = {
    LOW: <Battery className="h-3 w-3 text-green-500" />,
    MEDIUM: <BatteryMedium className="h-3 w-3 text-yellow-500" />,
    HIGH: <BatteryFull className="h-3 w-3 text-red-500" />,
  };
  return <>{icons[level] || null}</>;
}

function TimeBadge({ mins }: { mins: number }) {
  const label = mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

function OutlineTaskRow({
  task,
  onComplete,
  onStatusChange,
  onRename,
}: {
  task: OutlineTask;
  onComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onRename: (taskId: string, title: string) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const rowRef = useRef<HTMLDivElement>(null);

  function handleStatusClick() {
    if (task.status === "NOT_STARTED") {
      onStatusChange?.(task.id, "IN_PROGRESS");
    } else if (task.status === "IN_PROGRESS") {
      setCompleting(true);
      onComplete(task.id);
    }
  }

  function handleTitleSave() {
    if (editTitle.trim() && editTitle.trim() !== task.title) {
      onRename(task.id, editTitle.trim());
    } else {
      setEditTitle(task.title);
    }
    setEditingTitle(false);
    // Return focus to the row so keyboard nav continues working
    requestAnimationFrame(() => rowRef.current?.focus());
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors",
        "outline-none focus:bg-muted/50",
        completing && "opacity-50"
      )}
      tabIndex={0}
      role="treeitem"
      aria-selected={false}
      onKeyDown={(e) => {
        if (editingTitle) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const tree = e.currentTarget.closest("[role='tree']");
          if (!tree) return;
          const items = Array.from(tree.querySelectorAll<HTMLElement>("[role='treeitem']"));
          const idx = items.indexOf(e.currentTarget);
          const next = e.key === "ArrowDown" ? items[idx + 1] : items[idx - 1];
          next?.focus();
        } else if (e.key === " ") {
          e.preventDefault();
          handleStatusClick();
        } else if (e.key === "Enter") {
          e.preventDefault();
          setEditTitle(task.title);
          setEditingTitle(true);
        }
      }}
    >
      <StatusCircle
        status={completing ? "COMPLETED" : task.status}
        onClick={handleStatusClick}
        disabled={completing}
      />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {editingTitle ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") {
                  setEditTitle(task.title);
                  setEditingTitle(false);
                  requestAnimationFrame(() => rowRef.current?.focus());
                }
              }}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setEditTitle(task.title);
                setEditingTitle(true);
              }}
              className="text-sm font-medium text-left hover:underline cursor-pointer"
              tabIndex={-1}
            >
              {task.title}
            </button>
          )}

          {task.isNextAction && (
            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
          )}

          {task.context && (
            <Link href={`/do-now?context=${encodeURIComponent(task.context.name)}`} tabIndex={-1}>
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0 cursor-pointer hover:opacity-80"
                style={
                  task.context.color
                    ? { borderColor: task.context.color, color: task.context.color }
                    : undefined
                }
              >
                {task.context.name}
              </Badge>
            </Link>
          )}

          {task.estimatedMins && <TimeBadge mins={task.estimatedMins} />}
          {task.energyLevel && <EnergyDot level={task.energyLevel} />}

          {task.dueDate && (
            <span
              className={cn(
                "text-xs",
                new Date(task.dueDate) < new Date()
                  ? "text-destructive font-medium"
                  : "text-muted-foreground"
              )}
            >
              Due {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AddTaskInput({
  projectId,
  onAddTask,
}: {
  projectId: string;
  onAddTask: (projectId: string, title: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function handleSubmit() {
    if (newTitle.trim()) {
      onAddTask(projectId, newTitle.trim());
      setNewTitle("");
      // stay open for rapid multi-add
    } else {
      setAdding(false);
    }
  }

  function handleCancel() {
    setNewTitle("");
    setAdding(false);
  }

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add task
      </button>
    );
  }

  return (
    <div className="px-3 py-1">
      <Input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onBlur={handleCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Escape") handleCancel();
        }}
        placeholder="New task title…"
        className="h-7 text-sm"
        autoFocus
      />
    </div>
  );
}

function OutlineProjectNode({
  project,
  depth,
  expandedIds,
  onToggle,
  onCompleteTask,
  onCompleteProject,
  onStatusChange,
  onAddTask,
  onRenameTask,
  onTeamFilter,
  onAreaFilter,
  sequencePosition,
}: {
  project: OutlineProject;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onCompleteTask: (taskId: string) => void;
  onCompleteProject?: (projectId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onAddTask: (projectId: string, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onTeamFilter?: (teamId: string) => void;
  onAreaFilter?: (areaId: string) => void;
  sequencePosition?: { index: number; total: number };
}) {
  const isExpanded = expandedIds.has(project.id);
  const hasContent = project.tasks.length > 0 || project.childProjects.length > 0;
  const progress = project.rollupProgress != null
    ? project.rollupProgress
    : project.taskCounts.total > 0
      ? Math.round((project.taskCounts.completed / project.taskCounts.total) * 100)
      : 0;

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      {/* Project header — always visible */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors group"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowRight" && !isExpanded) {
            e.preventDefault();
            onToggle(project.id);
          } else if (e.key === "ArrowLeft" && isExpanded) {
            e.preventDefault();
            onToggle(project.id);
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const tree = e.currentTarget.closest("[role='tree']");
            if (!tree) return;
            const items = Array.from(tree.querySelectorAll<HTMLElement>("[role='treeitem']"));
            const idx = items.indexOf(e.currentTarget);
            const next = e.key === "ArrowDown" ? items[idx + 1] : items[idx - 1];
            next?.focus();
          }
        }}
        tabIndex={0}
        role="treeitem"
        aria-selected={false}
        aria-expanded={isExpanded}
      >
        <button
          onClick={() => onToggle(project.id)}
          className="shrink-0"
          tabIndex={-1}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </button>

        <StatusCircle
          status={project.status}
          onClick={() => onCompleteProject?.(project.id)}
          disabled={project.status === "COMPLETED" || project.status === "DROPPED" || !onCompleteProject}
        />

        <Link
          href={`/projects/${project.id}`}
          className="text-sm font-medium hover:underline truncate"
          tabIndex={-1}
        >
          {project.title}
        </Link>

        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 shrink-0">
          {typeIcons[project.type]}
          {typeLabels[project.type] || project.type}
        </Badge>

        {sequencePosition && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 shrink-0 font-mono tabular-nums",
              project.status === "ACTIVE" && "border-green-500 text-green-700 dark:text-green-400",
              project.status === "COMPLETED" && "border-blue-500 text-blue-700 dark:text-blue-400",
              (project.status === "ON_HOLD" || project.status === "DROPPED") && "border-muted-foreground/40 text-muted-foreground",
            )}
          >
            {sequencePosition.index}/{sequencePosition.total}
          </Badge>
        )}

        {project.team && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 gap-1 shrink-0 cursor-pointer hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onTeamFilter?.(project.team!.id);
            }}
          >
            <TeamIcon icon={project.team.icon} className="h-3 w-3 inline" /> {project.team.name}
          </Badge>
        )}

        {project.area && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 shrink-0 cursor-pointer hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onAreaFilter?.(project.area!.id);
            }}
          >
            {project.area.name}
          </Badge>
        )}

        {/* Progress bar */}
        <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          {project.taskCounts.completed}/{project.taskCounts.total}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-4 border-l border-border pl-2">
          {/* Child projects first */}
          {project.childProjects.map((child, idx) => (
            <OutlineProjectNode
              key={child.id}
              project={child}
              depth={0}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onCompleteTask={onCompleteTask}
              onCompleteProject={onCompleteProject}
              onStatusChange={onStatusChange}
              onAddTask={onAddTask}
              onRenameTask={onRenameTask}
              onTeamFilter={onTeamFilter}
              onAreaFilter={onAreaFilter}
              sequencePosition={
                (project.childType || "SEQUENTIAL") === "SEQUENTIAL"
                  ? { index: idx + 1, total: project.childProjects.length }
                  : undefined
              }
            />
          ))}

          {/* Tasks */}
          {project.tasks.length > 0 && (
            <div className="py-1">
              {project.tasks.map((task) => (
                <OutlineTaskRow
                  key={task.id}
                  task={task}
                  onComplete={onCompleteTask}
                  onStatusChange={onStatusChange}
                  onRename={onRenameTask}
                />
              ))}
            </div>
          )}

          {/* Add task button / inline input */}
          <AddTaskInput projectId={project.id} onAddTask={onAddTask} />

          {!hasContent && (
            <p className="text-xs text-muted-foreground px-3 py-2">No active tasks</p>
          )}
        </div>
      )}
    </div>
  );
}

function collectAllIds(projs: OutlineProject[]): string[] {
  const ids: string[] = [];
  for (const p of projs) {
    ids.push(p.id);
    if (p.childProjects.length > 0) {
      ids.push(...collectAllIds(p.childProjects));
    }
  }
  return ids;
}

function OutlineSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[200px]" />
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-1.5 w-20 rounded-full" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}

function loadExpandedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    // ignore
  }
  return new Set();
}

function saveExpandedIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function MasterOutlineView({ projects, onCompleteTask, onCompleteProject, onStatusChange, onAddTask, onRenameTask, onTeamFilter, onAreaFilter, autoExpandAll, loading, actionsRef }: MasterOutlineViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const prevAutoExpand = useRef(autoExpandAll);
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (!initialized.current) {
      const saved = loadExpandedIds();
      if (saved.size > 0) setExpandedIds(saved);
      initialized.current = true;
    }
  }, []);

  // Handle autoExpandAll toggle from parent (e.g. project filter selection)
  useEffect(() => {
    if (autoExpandAll && !prevAutoExpand.current) {
      const all = new Set(collectAllIds(projects));
      setExpandedIds(all);
      saveExpandedIds(all);
    } else if (!autoExpandAll && prevAutoExpand.current) {
      setExpandedIds(new Set());
      saveExpandedIds(new Set());
    }
    prevAutoExpand.current = autoExpandAll;
  }, [autoExpandAll, projects]);

  const onToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveExpandedIds(next);
      return next;
    });
  }, []);

  function expandAll() {
    const all = new Set(collectAllIds(projects));
    setExpandedIds(all);
    saveExpandedIds(all);
  }

  function collapseAll() {
    const empty = new Set<string>();
    setExpandedIds(empty);
    saveExpandedIds(empty);
  }

  const allIds = collectAllIds(projects);
  const isAllExpanded = allIds.length > 0 && allIds.every((id) => expandedIds.has(id));

  // Expose actions to parent
  if (actionsRef) {
    actionsRef.current = { expandAll, collapseAll, isAllExpanded };
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
        <OutlineSkeleton />
      </div>
    );
  }

  return (
    <div>
      {/* Project tree */}
      <div className="space-y-0.5" role="tree">
        {projects.map((project) => (
          <OutlineProjectNode
            key={project.id}
            project={project}
            depth={0}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onCompleteTask={onCompleteTask}
            onCompleteProject={onCompleteProject}
            onStatusChange={onStatusChange}
            onAddTask={onAddTask}
            onRenameTask={onRenameTask}
            onTeamFilter={onTeamFilter}
            onAreaFilter={onAreaFilter}
          />
        ))}
      </div>
    </div>
  );
}
