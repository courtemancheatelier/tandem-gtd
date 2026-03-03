"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusCircle } from "@/components/shared/StatusCircle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TeamIcon } from "@/components/teams/team-icons";
import { WikiLinkRenderer } from "@/components/shared/WikiLinkRenderer";
import {
  Clock,
  Zap,
  Battery,
  BatteryMedium,
  BatteryFull,
  ChevronDown,
  ChevronUp,
  Trash2,
  History,
  Loader2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TaskTimeline = lazy(() =>
  import("@/components/history/TaskTimeline").then((m) => ({ default: m.TaskTimeline }))
);

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    notes?: string | null;
    status: string;
    isNextAction: boolean;
    estimatedMins?: number | null;
    energyLevel?: string | null;
    dueDate?: string | null;
    scheduledDate?: string | null;
    project?: { id: string; title: string; type: string; team?: { id: string; name: string; icon?: string | null } | null } | null;
    context?: { id: string; name: string; color: string | null } | null;
  };
  onComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  contexts?: { id: string; name: string; color: string | null }[];
  onUpdate?: (taskId: string, data: Record<string, unknown>) => void;
  onDelete?: (taskId: string) => void;
  onFilterLooseTasks?: () => void;
  onFilterEnergy?: (level: string) => void;
  onFilterContext?: (contextId: string) => void;
  onFilterTime?: (mins: number) => void;
  onFilterDue?: (due: string) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function EnergyDot({ level }: { level: string }) {
  const icons = {
    LOW: <Battery className="h-3 w-3 text-green-500" />,
    MEDIUM: <BatteryMedium className="h-3 w-3 text-yellow-500" />,
    HIGH: <BatteryFull className="h-3 w-3 text-red-500" />,
  };
  return icons[level as keyof typeof icons] || null;
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

export function TaskCard({ task, onComplete, onStatusChange, contexts, onUpdate, onDelete, onFilterLooseTasks, onFilterEnergy, onFilterContext, onFilterTime, onFilterDue, isSelected, onToggleSelect }: TaskCardProps) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [notesFocused, setNotesFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  function handleStatusClick() {
    if (task.status === "NOT_STARTED") {
      onStatusChange?.(task.id, "IN_PROGRESS");
    } else if (task.status === "IN_PROGRESS") {
      setCompleting(true);
      onComplete(task.id);
    }
  }

  function handleTitleSave() {
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdate?.(task.id, { title: editTitle.trim() });
    } else {
      setEditTitle(task.title);
    }
    setEditingTitle(false);
  }

  function handleNotesSave() {
    if (editNotes !== (task.notes || "")) {
      onUpdate?.(task.id, { notes: editNotes });
    }
    setNotesFocused(false);
  }

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      className={cn(
        "rounded-lg border transition-all",
        completing && "opacity-50 scale-95",
        isOverdue && "border-destructive/50",
        isSelected && "bg-primary/5 border-primary/30"
      )}
    >
      <div
        className="flex items-center gap-3 px-3 py-[0.3rem] cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {onToggleSelect && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className={cn(!isSelected && "opacity-40")}
            />
          </div>
        )}
        <StatusCircle
          status={completing ? "COMPLETED" : task.status}
          onClick={handleStatusClick}
          disabled={completing}
        />
        <div className="flex-1 min-w-0">
          {/* Mobile: two lines (title, then metadata). Desktop: single line. */}
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <div onClick={(e) => e.stopPropagation()} className="min-w-0 shrink">
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
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTitle(true);
                }}
                className={cn(
                  "text-sm font-medium text-left hover:underline cursor-text truncate min-w-0 shrink",
                  completing && "cursor-default"
                )}
              >
                {task.title}
              </button>
            )}
            {task.isNextAction && (
              <Zap className="h-3 w-3 text-primary shrink-0" />
            )}
            {/* Desktop-only: metadata inline with title */}
            <div className="hidden md:contents">
              {task.project ? (
                <Link
                  href={`/projects/${task.project.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-muted-foreground hover:text-primary shrink-0 truncate max-w-none"
                >
                  {task.project.title}
                </Link>
              ) : onFilterLooseTasks ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterLooseTasks();
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground shrink-0"
                  title="Filter to loose tasks"
                >
                  <Unlink className="h-3 w-3" />
                  Loose
                </button>
              ) : null}
              {task.project?.team && (
                <span className="text-xs text-muted-foreground shrink-0">
                  <TeamIcon icon={task.project.team.icon} className="h-3 w-3 inline" /> {task.project.team.name}
                </span>
              )}
              {task.context && (
                onFilterContext ? (
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 shrink-0 cursor-pointer hover:opacity-70"
                    style={
                      task.context.color
                        ? { borderColor: task.context.color, color: task.context.color }
                        : undefined
                    }
                    onClick={(e) => { e.stopPropagation(); onFilterContext(task.context!.id); }}
                    title={`Filter by ${task.context.name}`}
                  >
                    {task.context.name}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 shrink-0"
                    style={
                      task.context.color
                        ? { borderColor: task.context.color, color: task.context.color }
                        : undefined
                    }
                  >
                    {task.context.name}
                  </Badge>
                )
              )}
              {task.estimatedMins && (
                onFilterTime ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onFilterTime(task.estimatedMins!); }}
                    className="shrink-0 hover:opacity-70"
                    title={`Filter by ${task.estimatedMins >= 60 ? `${Math.round(task.estimatedMins / 60)}h` : `${task.estimatedMins}m`}`}
                  >
                    <TimeBadge mins={task.estimatedMins} />
                  </button>
                ) : (
                  <span className="shrink-0"><TimeBadge mins={task.estimatedMins} /></span>
                )
              )}
              {task.energyLevel && (
                onFilterEnergy ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onFilterEnergy(task.energyLevel!); }}
                    className="shrink-0 hover:opacity-70"
                    title={`Filter by ${task.energyLevel!.toLowerCase()} energy`}
                  >
                    <EnergyDot level={task.energyLevel} />
                  </button>
                ) : (
                  <span className="shrink-0"><EnergyDot level={task.energyLevel} /></span>
                )
              )}
              {task.dueDate && (
                onFilterDue ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const due = new Date(task.dueDate!);
                      const now = new Date();
                      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      if (due < startOfToday) onFilterDue("overdue");
                      else onFilterDue("week");
                    }}
                    className={cn(
                      "text-xs shrink-0 hover:opacity-70",
                      isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                    )}
                    title="Filter by due date"
                  >
                    {new Date(task.dueDate).toLocaleDateString()}
                  </button>
                ) : (
                  <span
                    className={cn(
                      "text-xs shrink-0",
                      isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                    )}
                  >
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )
              )}
            </div>
          </div>
          {/* Mobile-only: metadata on second line */}
          <div className="flex items-center gap-2 mt-1 md:hidden flex-wrap">
            {task.project ? (
              <Link
                href={`/projects/${task.project.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-muted-foreground hover:text-primary truncate max-w-[10rem]"
              >
                {task.project.title}
              </Link>
            ) : onFilterLooseTasks ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterLooseTasks();
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                title="Filter to loose tasks"
              >
                <Unlink className="h-3 w-3" />
                Loose
              </button>
            ) : null}
            {task.context && (
              onFilterContext ? (
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0 cursor-pointer hover:opacity-70"
                  style={
                    task.context.color
                      ? { borderColor: task.context.color, color: task.context.color }
                      : undefined
                  }
                  onClick={(e) => { e.stopPropagation(); onFilterContext(task.context!.id); }}
                  title={`Filter by ${task.context.name}`}
                >
                  {task.context.name}
                </Badge>
              ) : (
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
              )
            )}
            {task.estimatedMins && (
              onFilterTime ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onFilterTime(task.estimatedMins!); }}
                  className="hover:opacity-70"
                  title={`Filter by ${task.estimatedMins >= 60 ? `${Math.round(task.estimatedMins / 60)}h` : `${task.estimatedMins}m`}`}
                >
                  <TimeBadge mins={task.estimatedMins} />
                </button>
              ) : (
                <TimeBadge mins={task.estimatedMins} />
              )
            )}
            {task.energyLevel && (
              onFilterEnergy ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onFilterEnergy(task.energyLevel!); }}
                  className="hover:opacity-70"
                  title={`Filter by ${task.energyLevel!.toLowerCase()} energy`}
                >
                  <EnergyDot level={task.energyLevel} />
                </button>
              ) : (
                <EnergyDot level={task.energyLevel} />
              )
            )}
            {task.dueDate && (
              onFilterDue ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const due = new Date(task.dueDate!);
                    const now = new Date();
                    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    if (due < startOfToday) onFilterDue("overdue");
                    else onFilterDue("week");
                  }}
                  className={cn(
                    "text-xs hover:opacity-70",
                    isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                  )}
                  title="Filter by due date"
                >
                  {new Date(task.dueDate).toLocaleDateString()}
                </button>
              ) : (
                <span
                  className={cn(
                    "text-xs",
                    isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                  )}
                >
                  {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* Expanded editing section */}
      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Notes
            </label>
            {notesFocused ? (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                onBlur={handleNotesSave}
                placeholder="Add notes..."
                rows={3}
                className="text-sm"
                teamId={task.project?.team?.id}
                autoFocus
              />
            ) : (
              <div
                onClick={() => setNotesFocused(true)}
                className="min-h-[4rem] rounded-md border border-input bg-background px-3 py-2 text-sm cursor-text"
              >
                {editNotes ? (
                  <WikiLinkRenderer text={editNotes} teamId={task.project?.team?.id} className="whitespace-pre-wrap" />
                ) : (
                  <span className="text-muted-foreground">Add notes...</span>
                )}
              </div>
            )}
          </div>

          {/* Metadata selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Status
              </label>
              <Select
                value={task.status}
                onValueChange={(value) =>
                  onStatusChange?.(task.id, value)
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">Not started</SelectItem>
                  <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Context */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Context
              </label>
              <Select
                value={task.context?.id || "__none__"}
                onValueChange={(value) =>
                  onUpdate?.(task.id, { contextId: value === "__none__" ? null : value })
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Energy
              </label>
              <Select
                value={task.energyLevel || "__none__"}
                onValueChange={(value) =>
                  onUpdate?.(task.id, { energyLevel: value === "__none__" ? null : value })
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Est. time
              </label>
              <Select
                value={task.estimatedMins?.toString() || "__none__"}
                onValueChange={(value) =>
                  onUpdate?.(task.id, {
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Due date
              </label>
              <div className="flex gap-1">
                <Input
                  type="date"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  onChange={(e) =>
                    onUpdate?.(task.id, {
                      dueDate: e.target.value
                        ? new Date(e.target.value + "T00:00:00").toISOString()
                        : null,
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* History */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-3.5 w-3.5 mr-1" />
              History
              {showHistory ? (
                <ChevronUp className="h-3 w-3 ml-1" />
              ) : (
                <ChevronDown className="h-3 w-3 ml-1" />
              )}
            </Button>
            {showHistory && (
              <div className="mt-2">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <TaskTimeline taskId={task.id} defaultCollapsed={false} initialLimit={5} />
                </Suspense>
              </div>
            )}
          </div>

          {/* Project link & Delete */}
          <div className="flex items-center justify-between">
            {task.project ? (
              <div className="text-xs text-muted-foreground">
                Project:{" "}
                <Link
                  href={`/projects/${task.project.id}`}
                  className="text-primary underline hover:text-primary/80"
                >
                  {task.project.title}
                </Link>
              </div>
            ) : (
              <div />
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(task.id)}
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
