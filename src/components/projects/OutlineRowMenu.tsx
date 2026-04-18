"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Play,
  CheckCircle2,
  RotateCcw,
  MapPin,
  Calendar,
  FolderOutput,
  FolderPlus,
  Trash2,
  ExternalLink,
  Pencil,
  Plus,
  ArrowDownToLine,
  ArrowUpToLine,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface ContextItem {
  id: string;
  name: string;
  color: string | null;
}

interface ProjectPickerItem {
  id: string;
  title: string;
}

export interface OutlineMenuActions {
  contexts: ContextItem[];
  moveTargets: ProjectPickerItem[];
  onSetStatus?: (taskId: string, status: string) => void;
  onCompleteTask?: (taskId: string) => void;
  onSetContext?: (taskId: string, contextId: string | null) => void;
  onSetDueDate?: (taskId: string, dueDate: string | null) => void;
  onMoveTask?: (taskId: string, projectId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDemoteToSubProject?: (taskId: string, taskTitle: string, parentProjectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onPromoteToTask?: (projectId: string, projectTitle: string, parentProjectId: string) => void;
  onAddTask?: (projectId: string) => void;
  onAddSubProject?: (projectId: string, title: string) => void;
  onEditProjectName?: (projectId: string) => void;
}

export function OutlineTaskMenu({
  taskId,
  taskTitle,
  taskStatus,
  parentProjectId,
  currentDepth,
  actions,
}: {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  parentProjectId: string;
  currentDepth: number;
  actions: OutlineMenuActions;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dueDateValue, setDueDateValue] = useState("");

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}>
      <DropdownMenuTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Status actions */}
        {taskStatus === "NOT_STARTED" && (
          <DropdownMenuItem onClick={() => actions.onSetStatus?.(taskId, "IN_PROGRESS")}>
            <Play className="h-4 w-4 mr-2" /> Mark in progress
          </DropdownMenuItem>
        )}
        {(taskStatus === "NOT_STARTED" || taskStatus === "IN_PROGRESS") && (
          <DropdownMenuItem onClick={() => actions.onCompleteTask?.(taskId)}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Mark complete
          </DropdownMenuItem>
        )}
        {taskStatus === "COMPLETED" && (
          <DropdownMenuItem onClick={() => actions.onSetStatus?.(taskId, "NOT_STARTED")}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reopen
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Set context */}
        {actions.contexts.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MapPin className="h-4 w-4 mr-2" /> Set context
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => actions.onSetContext?.(taskId, null)}>
                <span className="text-muted-foreground">None</span>
              </DropdownMenuItem>
              {actions.contexts.map((ctx) => (
                <DropdownMenuItem
                  key={ctx.id}
                  onClick={() => actions.onSetContext?.(taskId, ctx.id)}
                >
                  {ctx.color && (
                    <span
                      className="w-2 h-2 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: ctx.color }}
                    />
                  )}
                  {ctx.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Set due date */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Calendar className="h-4 w-4 mr-2" /> Set due date
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <div className="p-2">
              <Input
                type="date"
                value={dueDateValue}
                onChange={(e) => setDueDateValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dueDateValue) {
                    actions.onSetDueDate?.(taskId, dueDateValue);
                  }
                }}
                className="h-7 text-sm"
              />
              <div className="flex gap-1 mt-1">
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    if (dueDateValue) actions.onSetDueDate?.(taskId, dueDateValue);
                  }}
                >
                  Set
                </button>
                <button
                  className="text-xs text-muted-foreground hover:underline ml-auto"
                  onClick={() => {
                    setDueDateValue("");
                    actions.onSetDueDate?.(taskId, null);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Move to project */}
        {actions.moveTargets.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderOutput className="h-4 w-4 mr-2" /> Move to...
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
              {actions.moveTargets.map((proj) => (
                <DropdownMenuItem
                  key={proj.id}
                  onClick={() => actions.onMoveTask?.(taskId, proj.id)}
                >
                  {proj.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />

        {/* Convert to sub-project */}
        <DropdownMenuItem
          disabled={currentDepth >= 2}
          onClick={() => actions.onDemoteToSubProject?.(taskId, taskTitle, parentProjectId)}
        >
          <ArrowDownToLine className="h-4 w-4 mr-2" /> Convert to sub-project
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Delete */}
        {confirmDelete ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => actions.onDeleteTask?.(taskId)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Confirm delete
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OutlineProjectMenu({
  projectId,
  projectTitle,
  parentProjectId,
  currentDepth,
  hasChildren,
  actions,
}: {
  projectId: string;
  projectTitle: string;
  parentProjectId: string | null;
  currentDepth: number;
  hasChildren: boolean;
  actions: OutlineMenuActions;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}>
      <DropdownMenuTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Open project detail */}
        <DropdownMenuItem asChild>
          <a href={`/projects/${projectId}`}>
            <ExternalLink className="h-4 w-4 mr-2" /> Open project
          </a>
        </DropdownMenuItem>

        {/* Edit name */}
        <DropdownMenuItem onClick={() => actions.onEditProjectName?.(projectId)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit name
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Add task */}
        <DropdownMenuItem onClick={() => actions.onAddTask?.(projectId)}>
          <Plus className="h-4 w-4 mr-2" /> Add task
        </DropdownMenuItem>

        {/* Add sub-project */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={currentDepth >= 2}>
            <FolderPlus className="h-4 w-4 mr-2" /> Add sub-project
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <div className="p-2">
              <Input
                value={newSubTitle}
                onChange={(e) => setNewSubTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubTitle.trim()) {
                    actions.onAddSubProject?.(projectId, newSubTitle.trim());
                    setNewSubTitle("");
                  }
                }}
                placeholder="Sub-project title..."
                className="h-7 text-sm"
                autoFocus
              />
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Convert to task (only for sub-projects with no children) */}
        {parentProjectId && (
          <DropdownMenuItem
            disabled={hasChildren}
            onClick={() => actions.onPromoteToTask?.(projectId, projectTitle, parentProjectId)}
          >
            <ArrowUpToLine className="h-4 w-4 mr-2" /> Convert to task
          </DropdownMenuItem>
        )}

        {/* Delete */}
        {confirmDelete ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => actions.onDeleteProject?.(projectId)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Confirm delete
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
