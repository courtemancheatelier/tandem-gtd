"use client";

import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusCircle } from "@/components/shared/StatusCircle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WikiLinkRenderer } from "@/components/shared/WikiLinkRenderer";
import {
  Clock,
  Battery,
  BatteryMedium,
  BatteryFull,
  Star,
  ChevronDown,
  ChevronUp,
  Trash2,
  Unlink,
  User,
  GripVertical,
  FolderUp,
} from "lucide-react";

export interface TaskDependencyInfo {
  id: string;
  type: string;
  lagMinutes: number;
  predecessor: { id: string; title: string; status: string };
}

export interface TaskSuccessorInfo {
  id: string;
  type: string;
  lagMinutes: number;
  successor: { id: string; title: string; status: string };
}

export interface ProjectTask {
  id: string;
  title: string;
  notes?: string | null;
  status: string;
  isNextAction: boolean;
  isMilestone?: boolean;
  percentComplete?: number;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  sortOrder: number;
  dueDate?: string | null;
  version: number;
  context?: { id: string; name: string; color: string | null } | null;
  assignedTo?: { id: string; name: string | null } | null;
  predecessors?: TaskDependencyInfo[];
  successors?: TaskSuccessorInfo[];
}

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

interface ProjectTaskItemProps {
  task: ProjectTask;
  index: number;
  isSequential: boolean;
  onComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
  onDeleteTask?: (taskId: string) => void;
  onDetachTask?: (taskId: string) => void;
  onPromoteToSubProject?: (taskId: string, taskTitle: string) => void;
  onUncompleteTask?: (taskId: string) => void;
  contexts?: { id: string; name: string; color: string | null }[];
  teamMembers?: TeamMember[];
  teamId?: string | null;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  conflictHighlight?: boolean;
  conflictFields?: string[];
  // Reorder props
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
}

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

export function ProjectTaskItem({
  task,
  index,
  isSequential,
  onComplete,
  onStatusChange,
  onUpdateTask,
  onDeleteTask,
  onDetachTask,
  onPromoteToSubProject,
  onUncompleteTask,
  contexts,
  teamMembers,
  teamId,
  isSelected,
  onToggleSelect,
  conflictHighlight,
  conflictFields,
  draggable,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragOver,
}: ProjectTaskItemProps) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [notesFocused, setNotesFocused] = useState(false);

  // Re-sync local state when task prop changes (e.g. after conflict refetch)
  useEffect(() => { setEditTitle(task.title); }, [task.title]);
  useEffect(() => { if (!notesFocused) setEditNotes(task.notes || ""); }, [task.notes, notesFocused]);

  // Force expand on conflict so user can see the changed values
  // Include task.version so it re-fires when fresh data arrives after the conflict refetch
  useEffect(() => { if (conflictHighlight) setExpanded(true); }, [conflictHighlight, task.version]);

  const isConflictField = (field: string) => conflictHighlight && conflictFields?.includes(field);

  const isCompleted = task.status === "COMPLETED" || task.status === "DROPPED";

  function handleStatusClick() {
    if (task.status === "NOT_STARTED") {
      onStatusChange?.(task.id, "IN_PROGRESS");
    } else if (task.status === "IN_PROGRESS") {
      setCompleting(true);
      onComplete(task.id);
    } else if (isCompleted) {
      onUncompleteTask?.(task.id);
    }
  }

  function handleTitleSave() {
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdateTask(task.id, { title: editTitle.trim() });
    } else {
      setEditTitle(task.title);
    }
    setEditingTitle(false);
  }

  function handleNotesSave() {
    if (editNotes !== (task.notes || "")) {
      onUpdateTask(task.id, { notes: editNotes });
    }
    setNotesFocused(false);
  }

  return (
    <div
      className={cn(
        "rounded-lg border transition-all",
        isCompleted && "opacity-50",
        completing && "opacity-50 scale-[0.98]",
        isSelected && "bg-primary/5 border-primary/30",
        isDragging && "opacity-40 scale-[0.98]",
        isDragOver && "border-primary border-dashed"
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={cn("flex items-center gap-2 px-2 py-1", !isCompleted && "cursor-pointer")}
        onClick={() => { if (!isCompleted) setExpanded(!expanded); }}
      >
        {/* Drag handle for reorder mode */}
        {draggable && !isCompleted && (
          <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        {onToggleSelect && !isCompleted && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className={cn("shrink-0", !isSelected && "opacity-40")}
          />
        )}

        {/* Order number for sequential projects */}
        {isSequential && !isCompleted && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground shrink-0">
            {index + 1}
          </span>
        )}

        <div onClick={(e) => e.stopPropagation()}>
          <StatusCircle
            status={completing ? "COMPLETED" : task.status}
            onClick={handleStatusClick}
            disabled={completing}
          />
        </div>

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
                  }
                }}
                className="h-7 text-sm"
                autoFocus
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isCompleted) {
                    setEditingTitle(true);
                  }
                }}
                className={cn(
                  "text-sm font-medium text-left hover:underline cursor-pointer transition-colors duration-1000",
                  isCompleted && "line-through cursor-default",
                  isConflictField("title") && "text-blue-500"
                )}
              >
                {task.title}
              </button>
            )}

            {task.isNextAction && !isCompleted && (
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
            )}

            {task.context && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0"
                style={
                  task.context.color
                    ? { borderColor: task.context.color, color: task.context.color }
                    : undefined
                }
              >
                {task.context.name}
              </Badge>
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
            {task.assignedTo && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {task.assignedTo.name || "Unnamed"}
              </span>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        {!isCompleted && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Expanded section */}
      {expanded && !isCompleted && (
        <div className="border-t px-3 py-3 space-y-3">
          {/* Notes */}
          <div>
            <label className={cn("text-xs font-medium mb-1 block transition-colors duration-1000", isConflictField("notes") ? "text-blue-500" : "text-muted-foreground")}>
              Notes {isConflictField("notes") && "— updated"}
            </label>
            {notesFocused ? (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                onBlur={handleNotesSave}
                placeholder="Add notes..."
                rows={3}
                className="text-sm"
                teamId={teamId}
                autoFocus
              />
            ) : (
              <div
                onClick={() => setNotesFocused(true)}
                className="min-h-[4rem] rounded-md border border-input bg-background px-3 py-2 text-sm cursor-text"
              >
                {editNotes ? (
                  <WikiLinkRenderer text={editNotes} teamId={teamId} className="whitespace-pre-wrap" />
                ) : (
                  <span className="text-muted-foreground">Add notes...</span>
                )}
              </div>
            )}
          </div>

          {/* Metadata selectors */}
          <div className="grid grid-cols-2 gap-3">
            {/* Context */}
            <div>
              <label className={cn("text-xs font-medium mb-1 block transition-colors duration-1000", isConflictField("contextId") ? "text-blue-500" : "text-muted-foreground")}>
                Context {isConflictField("contextId") && "— updated"}
              </label>
              <Select
                value={task.context?.id || "__none__"}
                onValueChange={(value) =>
                  onUpdateTask(task.id, { contextId: value === "__none__" ? null : value })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {contexts?.map((ctx) => (
                    <SelectItem key={ctx.id} value={ctx.id}>
                      {ctx.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Energy */}
            <div>
              <label className={cn("text-xs font-medium mb-1 block transition-colors duration-1000", isConflictField("energyLevel") ? "text-blue-500" : "text-muted-foreground")}>
                Energy {isConflictField("energyLevel") && "— updated"}
              </label>
              <Select
                value={task.energyLevel || "__none__"}
                onValueChange={(value) =>
                  onUpdateTask(task.id, { energyLevel: value === "__none__" ? null : value })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time estimate */}
            <div>
              <label className={cn("text-xs font-medium mb-1 block transition-colors duration-1000", isConflictField("estimatedMins") ? "text-blue-500" : "text-muted-foreground")}>
                Est. time {isConflictField("estimatedMins") && "— updated"}
              </label>
              <Select
                value={task.estimatedMins?.toString() || "__none__"}
                onValueChange={(value) =>
                  onUpdateTask(task.id, {
                    estimatedMins: value === "__none__" ? null : parseInt(value, 10),
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="5">5m</SelectItem>
                  <SelectItem value="15">15m</SelectItem>
                  <SelectItem value="30">30m</SelectItem>
                  <SelectItem value="60">1h</SelectItem>
                  <SelectItem value="120">2h</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Due date */}
            <div>
              <label className={cn("text-xs font-medium mb-1 block transition-colors duration-1000", isConflictField("dueDate") ? "text-blue-500" : "text-muted-foreground")}>
                Due date {isConflictField("dueDate") && "— updated"}
              </label>
              <Input
                type="date"
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) =>
                  onUpdateTask(task.id, { dueDate: e.target.value ? e.target.value + "T00:00:00.000Z" : null })
                }
                className="h-8 text-sm"
              />
            </div>

            {/* Assignee (team projects only) */}
            {teamMembers && teamMembers.length > 0 && (
              <div>
                <label className={cn("text-xs font-medium mb-1 block transition-colors duration-1000", isConflictField("assignedToId") ? "text-blue-500" : "text-muted-foreground")}>
                  Assignee {isConflictField("assignedToId") && "— updated"}
                </label>
                <Select
                  value={task.assignedTo?.id || "__none__"}
                  onValueChange={(value) =>
                    onUpdateTask(task.id, { assignedToId: value === "__none__" ? null : value })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Dependencies */}
          {task.predecessors && task.predecessors.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Depends on
              </label>
              <div className="flex flex-wrap gap-1">
                {task.predecessors.map((dep) => (
                  <Badge
                    key={dep.id}
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      dep.predecessor.status === "COMPLETED" && "line-through opacity-60"
                    )}
                  >
                    {dep.predecessor.title}
                    {dep.type !== "FINISH_TO_START" && (
                      <span className="ml-1 opacity-60">
                        ({dep.type.replace(/_/g, " ").toLowerCase()})
                      </span>
                    )}
                    {dep.lagMinutes > 0 && (
                      <span className="ml-1 opacity-60">
                        +{dep.lagMinutes}m
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {task.successors && task.successors.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Blocks
              </label>
              <div className="flex flex-wrap gap-1">
                {task.successors.map((dep) => (
                  <Badge key={dep.id} variant="outline" className="text-xs">
                    {dep.successor.title}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {onPromoteToSubProject && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onPromoteToSubProject(task.id, task.title)}
              >
                <FolderUp className="h-3.5 w-3.5 mr-1" />
                Promote to sub-project
              </Button>
            )}
            {onDetachTask && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onDetachTask(task.id)}
              >
                <Unlink className="h-3.5 w-3.5 mr-1" />
                Remove from project
              </Button>
            )}
            {onDeleteTask && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDeleteTask(task.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
