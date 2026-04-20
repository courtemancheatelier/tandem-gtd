"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TeamIcon } from "@/components/teams/team-icons";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { OutlineTaskMenu, OutlineProjectMenu } from "./OutlineRowMenu";
import type { OutlineMenuActions } from "./OutlineRowMenu";

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
  CalendarDays,
  GripVertical,
  ArrowUpDown,
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
  startDate?: string | null;
  endDate?: string | null;
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
  onCompleteTask: (taskId: string, note?: string) => void;
  onCompleteProject?: (projectId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onAddTask: (projectId: string, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onTeamFilter?: (teamId: string) => void;
  onAreaFilter?: (areaId: string) => void;
  autoExpandAll?: boolean;
  loading?: boolean;
  actionsRef?: React.MutableRefObject<OutlineActions | null>;
  // Phase 1: Context menus
  menuActions?: OutlineMenuActions;
  // Phase 2: Type badge toggle
  onToggleProjectType?: (projectId: string, newType: string, version: number) => void;
  // Phase 3: Promote/Demote
  onDemoteToSubProject?: (taskId: string, taskTitle: string, parentProjectId: string) => void;
  onPromoteToTask?: (projectId: string, projectTitle: string, parentProjectId: string) => void;
  // Phase 4: Multi-select
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleTaskSelection?: (taskId: string) => void;
  // Phase 5: Compact mode
  compact?: boolean;
  // Phase 6: Task reorder
  onReorderTasks?: (projectId: string, orderedTaskIds: string[]) => void;
  taskReorderProjectId?: string | null;
  onSetTaskReorderProjectId?: (projectId: string | null) => void;
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

export function EnergyDot({ level }: { level: string }) {
  const icons: Record<string, React.ReactNode> = {
    LOW: <Battery className="h-3 w-3 text-green-500" />,
    MEDIUM: <BatteryMedium className="h-3 w-3 text-yellow-500" />,
    HIGH: <BatteryFull className="h-3 w-3 text-red-500" />,
  };
  return <>{icons[level] || null}</>;
}

export function TimeBadge({ mins }: { mins: number }) {
  const label = mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

export function OutlineTaskRow({
  task,
  onComplete,
  onStatusChange,
  onRename,
  parentProjectId,
  currentDepth,
  menuActions,
  onDemoteToSubProject,
  selectionMode,
  isSelected,
  onToggleSelection,
  compact,
}: {
  task: OutlineTask;
  onComplete: (taskId: string, note?: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onRename: (taskId: string, title: string) => void;
  parentProjectId?: string;
  currentDepth?: number;
  menuActions?: OutlineMenuActions;
  onDemoteToSubProject?: (taskId: string, taskTitle: string, parentProjectId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (taskId: string) => void;
  compact?: boolean;
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
    requestAnimationFrame(() => rowRef.current?.focus());
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex items-center gap-3 px-3 rounded-md hover:bg-muted/50 transition-colors group",
        "outline-none focus:bg-muted/50",
        completing && "opacity-50",
        isSelected && "bg-primary/5",
        compact ? "py-1" : "py-1.5"
      )}
      tabIndex={0}
      role="treeitem"
      aria-selected={isSelected || false}
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
        } else if (e.key === "Enter" || e.key === "e" || e.key === "E") {
          if (e.key === "Enter" || (!e.metaKey && !e.ctrlKey)) {
            e.preventDefault();
            setEditTitle(task.title);
            setEditingTitle(true);
          }
        }
        // N — focus add task input for this section
        if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          // Find the AddTaskInput button in the same section
          const section = e.currentTarget.closest(".border-l, [role='tree']");
          const addBtn = section?.querySelector<HTMLButtonElement>("[data-add-task-btn]");
          addBtn?.click();
        }
        // ⌘+Enter — mark complete
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onComplete(task.id);
        }
        // ⌘+] — demote to sub-project
        if (e.key === "]" && (e.metaKey || e.ctrlKey) && parentProjectId && onDemoteToSubProject) {
          e.preventDefault();
          if ((currentDepth ?? 0) < 2) {
            onDemoteToSubProject(task.id, task.title, parentProjectId);
          }
        }
      }}
      onClick={(e) => {
        // ⌘-click to toggle selection
        if ((e.metaKey || e.ctrlKey) && onToggleSelection) {
          e.preventDefault();
          onToggleSelection(task.id);
        }
      }}
    >
      {/* Selection checkbox */}
      {(selectionMode || onToggleSelection) && (
        <div className={cn(
          "shrink-0",
          !selectionMode && "opacity-0 group-hover:opacity-100 transition-opacity"
        )}>
          <Checkbox
            checked={isSelected || false}
            onCheckedChange={() => onToggleSelection?.(task.id)}
            tabIndex={-1}
          />
        </div>
      )}

      <StatusCircle
        status={completing ? "COMPLETED" : task.status}
        onClick={handleStatusClick}
        disabled={completing}
      />

      <div className="min-w-0">
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
              className={cn("text-sm", compact ? "h-6" : "h-7")}
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setEditTitle(task.title);
                setEditingTitle(true);
              }}
              className={cn(
                "font-medium text-left hover:underline cursor-pointer",
                compact ? "text-xs" : "text-sm"
              )}
              tabIndex={-1}
            >
              {task.title}
            </button>
          )}

          {task.isNextAction && (
            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
          )}

          {!compact && task.context && (
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

          {!compact && task.estimatedMins && <TimeBadge mins={task.estimatedMins} />}
          {!compact && task.energyLevel && <EnergyDot level={task.energyLevel} />}

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

      {/* Context menu trigger */}
      {menuActions && parentProjectId && (
        <OutlineTaskMenu
          taskId={task.id}
          taskTitle={task.title}
          taskStatus={task.status}
          parentProjectId={parentProjectId}
          currentDepth={currentDepth ?? 0}
          actions={menuActions}
        />
      )}
    </div>
  );
}

export function AddTaskInput({
  projectId,
  onAddTask,
  compact,
}: {
  projectId: string;
  onAddTask: (projectId: string, title: string) => void;
  compact?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function handleSubmit() {
    if (newTitle.trim()) {
      onAddTask(projectId, newTitle.trim());
      setNewTitle("");
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
        data-add-task-btn
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
        placeholder="New task title..."
        className={cn("text-sm", compact ? "h-6" : "h-7")}
        autoFocus
      />
    </div>
  );
}

function OutlineProjectNode({
  project,
  depth,
  currentDepth,
  parentProjectId,
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
  menuActions,
  onToggleProjectType,
  onDemoteToSubProject,
  onPromoteToTask,
  selectionMode,
  selectedTaskIds,
  onToggleTaskSelection,
  compact,
  onReorderTasks,
  taskReorderProjectId,
  onSetTaskReorderProjectId,
}: {
  project: OutlineProject;
  depth: number;
  currentDepth: number;
  parentProjectId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onCompleteTask: (taskId: string, note?: string) => void;
  onCompleteProject?: (projectId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onAddTask: (projectId: string, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onTeamFilter?: (teamId: string) => void;
  onAreaFilter?: (areaId: string) => void;
  sequencePosition?: { index: number; total: number };
  menuActions?: OutlineMenuActions;
  onToggleProjectType?: (projectId: string, newType: string, version: number) => void;
  onDemoteToSubProject?: (taskId: string, taskTitle: string, parentProjectId: string) => void;
  onPromoteToTask?: (projectId: string, projectTitle: string, parentProjectId: string) => void;
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleTaskSelection?: (taskId: string) => void;
  compact?: boolean;
  onReorderTasks?: (projectId: string, orderedTaskIds: string[]) => void;
  taskReorderProjectId?: string | null;
  onSetTaskReorderProjectId?: (projectId: string | null) => void;
}) {
  const isExpanded = expandedIds.has(project.id);
  const hasContent = project.tasks.length > 0 || project.childProjects.length > 0;
  const progress = project.rollupProgress != null
    ? project.rollupProgress
    : project.taskCounts.total > 0
      ? Math.round((project.taskCounts.completed / project.taskCounts.total) * 100)
      : 0;

  // Task drag-to-reorder state
  const [taskDragIndex, setTaskDragIndex] = useState<number | null>(null);
  const [taskDragOverIndex, setTaskDragOverIndex] = useState<number | null>(null);
  const taskDragCounter = useRef(0);
  const isReorderingTasks = taskReorderProjectId === project.id;
  const activeTasks = project.tasks.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
  );
  const showTaskDragHandles = !!onReorderTasks && isReorderingTasks && activeTasks.length > 1;

  function handleTypeBadgeClick(e: React.MouseEvent) {
    if (!onToggleProjectType) return;
    e.stopPropagation();
    const newType = project.type === "SEQUENTIAL" ? "PARALLEL" : "SEQUENTIAL";
    onToggleProjectType(project.id, newType, project.version);
  }

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      {/* Project header */}
      <div
        className={cn(
          "flex items-center gap-2 px-2 rounded-md hover:bg-muted/30 transition-colors group",
          compact ? "py-1" : "py-1.5"
        )}
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
          // N — focus add task input for this project
          if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (!isExpanded) onToggle(project.id);
            requestAnimationFrame(() => {
              const section = e.currentTarget.closest("[style]")?.querySelector(".border-l");
              const addBtn = section?.querySelector<HTMLButtonElement>("[data-add-task-btn]");
              addBtn?.click();
            });
          }
          // ⌘+[ — promote to task
          if (e.key === "[" && (e.metaKey || e.ctrlKey) && parentProjectId && onPromoteToTask) {
            e.preventDefault();
            if (!hasContent) {
              onPromoteToTask(project.id, project.title, parentProjectId);
            }
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
          className={cn(
            "font-medium hover:underline truncate",
            compact ? "text-xs" : "text-sm"
          )}
          tabIndex={-1}
        >
          {project.title}
        </Link>

        {/* Type badge — clickable toggle when handler provided */}
        {onToggleProjectType && project.type !== "SINGLE_ACTIONS" ? (
          <button onClick={handleTypeBadgeClick} tabIndex={-1} className="shrink-0">
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:opacity-80 transition-opacity",
                project.type === "PARALLEL" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              )}
            >
              {typeIcons[project.type]}
              {typeLabels[project.type]}
            </Badge>
          </button>
        ) : (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 shrink-0">
            {typeIcons[project.type]}
            {typeLabels[project.type] || project.type}
          </Badge>
        )}

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

        {(project.startDate || project.endDate) && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 shrink-0">
            <CalendarDays className="h-3 w-3" />
            {project.startDate && project.endDate
              ? `${new Date(project.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(project.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : project.startDate
                ? `From ${new Date(project.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : `Until ${new Date(project.endDate!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </Badge>
        )}

        {/* Progress bar */}
        {!compact && (
          <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          {project.taskCounts.completed}/{project.taskCounts.total}
        </span>

        {/* Context menu */}
        {menuActions && (
          <OutlineProjectMenu
            projectId={project.id}
            projectTitle={project.title}
            parentProjectId={parentProjectId}
            currentDepth={currentDepth}
            hasChildren={hasContent}
            actions={menuActions}
          />
        )}
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
              currentDepth={currentDepth + 1}
              parentProjectId={project.id}
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
              menuActions={menuActions}
              onToggleProjectType={onToggleProjectType}
              onDemoteToSubProject={onDemoteToSubProject}
              onPromoteToTask={onPromoteToTask}
              selectionMode={selectionMode}
              selectedTaskIds={selectedTaskIds}
              onToggleTaskSelection={onToggleTaskSelection}
              compact={compact}
              onReorderTasks={onReorderTasks}
              taskReorderProjectId={taskReorderProjectId}
              onSetTaskReorderProjectId={onSetTaskReorderProjectId}
            />
          ))}

          {/* Tasks */}
          {project.tasks.length > 0 && (
            <div className="relative">
              {onReorderTasks && activeTasks.length > 1 && (
                <button
                  onClick={() => onSetTaskReorderProjectId?.(isReorderingTasks ? null : project.id)}
                  className={cn(
                    "absolute right-1 top-0 flex items-center gap-1 text-xs transition-colors z-10",
                    isReorderingTasks
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {isReorderingTasks ? "Done" : "Reorder"}
                </button>
              )}
              {project.tasks.map((task) => {
                const activeIdx = activeTasks.indexOf(task);
                const isActive = activeIdx !== -1;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center",
                      showTaskDragHandles && isActive && taskDragIndex === activeIdx && "opacity-50",
                      showTaskDragHandles && isActive && taskDragOverIndex === activeIdx && taskDragIndex !== activeIdx && "border-t-2 border-primary",
                    )}
                    draggable={showTaskDragHandles && isActive}
                    onDragStart={showTaskDragHandles && isActive ? () => {
                      setTaskDragIndex(activeIdx);
                      taskDragCounter.current = 0;
                    } : undefined}
                    onDragEnter={showTaskDragHandles && isActive ? () => {
                      taskDragCounter.current++;
                      setTaskDragOverIndex(activeIdx);
                    } : undefined}
                    onDragLeave={showTaskDragHandles && isActive ? () => {
                      taskDragCounter.current--;
                      if (taskDragCounter.current <= 0) {
                        setTaskDragOverIndex(null);
                        taskDragCounter.current = 0;
                      }
                    } : undefined}
                    onDragOver={showTaskDragHandles && isActive ? (e: React.DragEvent) => e.preventDefault() : undefined}
                    onDrop={showTaskDragHandles && isActive ? () => {
                      if (taskDragIndex === null || taskDragIndex === activeIdx) {
                        setTaskDragIndex(null);
                        setTaskDragOverIndex(null);
                        return;
                      }
                      const newOrder = [...activeTasks];
                      const [moved] = newOrder.splice(taskDragIndex, 1);
                      newOrder.splice(activeIdx, 0, moved);
                      onReorderTasks(project.id, newOrder.map((t) => t.id));
                      setTaskDragIndex(null);
                      setTaskDragOverIndex(null);
                    } : undefined}
                    onDragEnd={showTaskDragHandles ? () => {
                      setTaskDragIndex(null);
                      setTaskDragOverIndex(null);
                      taskDragCounter.current = 0;
                    } : undefined}
                  >
                    {showTaskDragHandles && isActive && (
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0 ml-1" />
                    )}
                    <div className="flex-1 min-w-0">
                      <OutlineTaskRow
                        task={task}
                        onComplete={onCompleteTask}
                        onStatusChange={onStatusChange}
                        onRename={onRenameTask}
                        parentProjectId={project.id}
                        currentDepth={currentDepth}
                        menuActions={menuActions}
                        onDemoteToSubProject={onDemoteToSubProject}
                        selectionMode={selectionMode}
                        isSelected={selectedTaskIds?.has(task.id)}
                        onToggleSelection={onToggleTaskSelection}
                        compact={compact}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add task */}
          <AddTaskInput projectId={project.id} onAddTask={onAddTask} compact={compact} />

          {/* Empty state */}
          {!hasContent && (
            <p className="text-xs text-muted-foreground px-3 py-2">No tasks yet.</p>
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

export function MasterOutlineView({
  projects,
  onCompleteTask,
  onCompleteProject,
  onStatusChange,
  onAddTask,
  onRenameTask,
  onTeamFilter,
  onAreaFilter,
  autoExpandAll,
  loading,
  actionsRef,
  menuActions,
  onToggleProjectType,
  onDemoteToSubProject,
  onPromoteToTask,
  selectionMode,
  selectedTaskIds,
  onToggleTaskSelection,
  compact,
  onReorderTasks,
  taskReorderProjectId,
  onSetTaskReorderProjectId,
}: MasterOutlineViewProps) {
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

  // Handle autoExpandAll toggle from parent
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
            currentDepth={0}
            parentProjectId={null}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onCompleteTask={onCompleteTask}
            onCompleteProject={onCompleteProject}
            onStatusChange={onStatusChange}
            onAddTask={onAddTask}
            onRenameTask={onRenameTask}
            onTeamFilter={onTeamFilter}
            onAreaFilter={onAreaFilter}
            menuActions={menuActions}
            onToggleProjectType={onToggleProjectType}
            onDemoteToSubProject={onDemoteToSubProject}
            onPromoteToTask={onPromoteToTask}
            selectionMode={selectionMode}
            selectedTaskIds={selectedTaskIds}
            onToggleTaskSelection={onToggleTaskSelection}
            compact={compact}
            onReorderTasks={onReorderTasks}
            taskReorderProjectId={taskReorderProjectId}
            onSetTaskReorderProjectId={onSetTaskReorderProjectId}
          />
        ))}
      </div>
    </div>
  );
}
