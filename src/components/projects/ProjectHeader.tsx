"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectStatusChanger } from "./ProjectStatusChanger";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Layers,
  ListChecks,
  Pencil,
  Trash2,
  ArrowLeft,
  BarChart3,
  Target,
  ChevronDown,
  Check,
  FolderInput,
  FolderOutput,
  FileText,
  GitBranch,
  CalendarDays,
  X,
  Compass,
  Copy,
  MoreHorizontal,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

const typeIcons: Record<string, React.ReactNode> = {
  SEQUENTIAL: <ArrowRight className="h-4 w-4" />,
  PARALLEL: <Layers className="h-4 w-4" />,
  SINGLE_ACTIONS: <ListChecks className="h-4 w-4" />,
};

const typeLabels: Record<string, string> = {
  SEQUENTIAL: "Sequential",
  PARALLEL: "Parallel",
  SINGLE_ACTIONS: "Single Actions",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HORIZON_LABELS: Record<string, string> = {
  RUNWAY: "Runway",
  HORIZON_1: "H1 - Projects",
  HORIZON_2: "H2 - Areas",
  HORIZON_3: "H3 - Goals",
  HORIZON_4: "H4 - Vision",
  HORIZON_5: "H5 - Purpose",
};

interface ProjectHeaderProps {
  project: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    type: string;
    childType?: string;
    outcome?: string | null;
    targetDate?: string | null;
    area?: { id: string; name: string } | null;
    goal?: { id: string; title: string; horizon?: string } | null;
    purgeScheduledAt?: string | null;
    retentionExempt?: boolean;
  };
  taskCounts: { total: number; completed: number };
  hasChildren?: boolean;
  goals?: { id: string; title: string; horizon?: string }[];
  areas?: { id: string; name: string }[];
  onUpdateProject: (data: Record<string, unknown>) => Promise<void>;
  onStatusChange: (status: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveProject?: () => void;
  onMakeStandalone?: () => void;
  onSaveAsTemplate?: () => void;
  onExemptFromPurge?: () => void;
  flowHref?: string;
  parentProject?: { id: string; title: string } | null;
}

const childTypeIcons: Record<string, React.ReactNode> = {
  SEQUENTIAL: <ArrowRight className="h-4 w-4" />,
  PARALLEL: <Layers className="h-4 w-4" />,
};

const childTypeLabels: Record<string, string> = {
  SEQUENTIAL: "Sequential",
  PARALLEL: "Parallel",
};

export function ProjectHeader({
  project,
  taskCounts,
  hasChildren,
  goals = [],
  areas = [],
  onUpdateProject,
  onStatusChange,
  onDelete,
  onMoveProject,
  onMakeStandalone,
  onSaveAsTemplate,
  onExemptFromPurge,
  flowHref,
  parentProject,
}: ProjectHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [editOutcome, setEditOutcome] = useState(project.outcome || "");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingChildType, setPendingChildType] = useState<string | null>(null);
  const [editingTargetDate, setEditingTargetDate] = useState(false);

  const progressPercent =
    taskCounts.total > 0
      ? Math.round((taskCounts.completed / taskCounts.total) * 100)
      : 0;

  function handleTitleSave() {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== project.title) {
      onUpdateProject({ title: trimmed });
    } else {
      setEditTitle(project.title);
    }
    setEditingTitle(false);
  }

  function handleOutcomeSave() {
    const trimmed = editOutcome.trim();
    if (trimmed !== (project.outcome || "")) {
      onUpdateProject({ outcome: trimmed || undefined });
    }
    setEditingOutcome(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Retention purge warning banner */}
      {project.purgeScheduledAt && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-destructive">Scheduled for deletion on{" "}
              {new Date(project.purgeScheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span className="text-muted-foreground ml-1">
              — Reactivate or exempt this project to prevent deletion.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange("ACTIVE")}
            >
              Reactivate
            </Button>
            {onExemptFromPurge && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExemptFromPurge}
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                Exempt
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Back link + parent breadcrumb */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Projects
        </Link>
        <span>/</span>
        <Link
          href="/projects/outline"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors shrink-0"
        >
          <FileText className="h-3.5 w-3.5" />
          Outline
        </Link>
        {parentProject && (
          <>
            <span>/</span>
            <Link
              href={`/projects/${parentProject.id}`}
              className="hover:text-foreground transition-colors truncate"
            >
              {parentProject.title}
            </Link>
          </>
        )}
      </div>

      {/* Title + Status + Type */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editingTitle ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") {
                  setEditTitle(project.title);
                  setEditingTitle(false);
                }
              }}
              className="text-2xl font-bold h-auto py-1"
              autoFocus
            />
          ) : (
            <h1
              className="text-2xl font-bold cursor-pointer hover:text-primary/80 transition-colors inline-flex items-center gap-2"
              onClick={() => setEditingTitle(true)}
            >
              {project.title}
              <Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 text-muted-foreground" />
            </h1>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Target date */}
            {editingTargetDate ? (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  defaultValue={project.targetDate ? new Date(project.targetDate).toISOString().slice(0, 10) : ""}
                  autoFocus
                  className="text-xs border rounded px-1.5 py-0.5 bg-background"
                  onBlur={(e) => {
                    setEditingTargetDate(false);
                    const val = e.target.value;
                    if (val) {
                      onUpdateProject({ targetDate: new Date(val + "T00:00:00Z").toISOString() });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      setEditingTargetDate(false);
                    }
                  }}
                />
              </div>
            ) : project.targetDate ? (
              <div className="flex items-center gap-0.5">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted gap-1"
                  onClick={() => setEditingTargetDate(true)}
                >
                  <CalendarDays className="h-3 w-3" />
                  Target: {new Date(project.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Badge>
                <button
                  onClick={() => onUpdateProject({ targetDate: null })}
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                  title="Clear target date"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingTargetDate(true)}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Set target date...
              </button>
            )}
            {/* Inline progress */}
            {taskCounts.total > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span>{taskCounts.completed}/{taskCounts.total} ({progressPercent}%)</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                {typeIcons[project.type]}
                <span className="text-xs">{typeLabels[project.type]}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"] as const).map((t) => (
                <DropdownMenuItem
                  key={t}
                  onClick={() => {
                    if (t !== project.type) onUpdateProject({ type: t });
                  }}
                  disabled={t === project.type}
                  className="flex items-center gap-2"
                >
                  {typeIcons[t]}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{typeLabels[t]}</div>
                    <div className="text-xs text-muted-foreground">
                      {t === "SEQUENTIAL" && "Tasks run in order"}
                      {t === "PARALLEL" && "All tasks available at once"}
                      {t === "SINGLE_ACTIONS" && "Loose, independent tasks"}
                    </div>
                  </div>
                  {t === project.type && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {hasChildren && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <GitBranch className="h-4 w-4" />
                  <span className="text-xs">{childTypeLabels[project.childType || "SEQUENTIAL"]}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(["SEQUENTIAL", "PARALLEL"] as const).map((ct) => (
                  <DropdownMenuItem
                    key={ct}
                    onClick={() => {
                      if (ct !== (project.childType || "SEQUENTIAL")) setPendingChildType(ct);
                    }}
                    disabled={ct === (project.childType || "SEQUENTIAL")}
                    className="flex items-center gap-2"
                  >
                    {childTypeIcons[ct]}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{childTypeLabels[ct]}</div>
                      <div className="text-xs text-muted-foreground">
                        {ct === "SEQUENTIAL" && "Sub-projects activate one at a time"}
                        {ct === "PARALLEL" && "All sub-projects active at once"}
                      </div>
                    </div>
                    {ct === (project.childType || "SEQUENTIAL") && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {goals.length > 0 && (
            <Select
              value={project.goal?.id ?? "__none__"}
              onValueChange={(value) =>
                onUpdateProject({ goalId: value === "__none__" ? null : value })
              }
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <Target className="h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="No goal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No goal</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {areas.length > 0 && (
            <Select
              value={project.area?.id ?? "__none__"}
              onValueChange={(value) =>
                onUpdateProject({ areaId: value === "__none__" ? null : value })
              }
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <Compass className="h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="No area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No area</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {flowHref && (
            <Link href={flowHref}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Flow
              </Button>
            </Link>
          )}
          <ProjectStatusChanger
            currentStatus={project.status}
            onStatusChange={onStatusChange}
          />
          {(onSaveAsTemplate || onMoveProject || (parentProject && onMakeStandalone)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onSaveAsTemplate && (
                  <DropdownMenuItem onClick={onSaveAsTemplate}>
                    <Copy className="h-4 w-4 mr-2" />
                    Save as template
                  </DropdownMenuItem>
                )}
                {onMoveProject && (
                  <DropdownMenuItem onClick={onMoveProject}>
                    <FolderInput className="h-4 w-4 mr-2" />
                    Move under project
                  </DropdownMenuItem>
                )}
                {parentProject && onMakeStandalone && (
                  <DropdownMenuItem onClick={onMakeStandalone}>
                    <FolderOutput className="h-4 w-4 mr-2" />
                    Detach from parent
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Outcome */}
      <div>
        {editingOutcome ? (
          <Textarea
            value={editOutcome}
            onChange={(e) => setEditOutcome(e.target.value)}
            onBlur={handleOutcomeSave}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditOutcome(project.outcome || "");
                setEditingOutcome(false);
              }
            }}
            placeholder="What does 'done' look like?"
            rows={2}
            className="text-sm"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingOutcome(true)}
            className={cn(
              "text-sm text-left w-full",
              project.outcome
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/50 italic hover:text-muted-foreground"
            )}
          >
            {project.outcome || "Click to add an outcome statement..."}
          </button>
        )}
      </div>

      <Separator />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{project.title}&rdquo; and all its
              tasks. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Child type change confirmation dialog */}
      <Dialog open={pendingChildType !== null} onOpenChange={(open) => { if (!open) setPendingChildType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change sub-project ordering?</DialogTitle>
            <DialogDescription>
              {pendingChildType === "SEQUENTIAL"
                ? "This will set all sub-projects except the first to On Hold. Only one sub-project will be active at a time."
                : "This will activate all queued (On Hold) sub-projects. All sub-projects will be active at once."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingChildType(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onUpdateProject({ childType: pendingChildType });
                setPendingChildType(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
