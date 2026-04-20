"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { X, MapPin, Zap, Clock, Circle, Trash2, Calendar, User, FolderOutput } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Context {
  id: string;
  name: string;
  color: string | null;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

interface SubProject {
  id: string;
  title: string;
}

interface BulkActionBarProps {
  selectionCount: number;
  contexts: Context[];
  onChangeContext: (contextId: string | null) => void;
  onChangeEnergy: (energy: string | null) => void;
  onChangeTime: (mins: number | null) => void;
  onChangeStatus: (status: string) => void;
  onChangeDueDate?: (dueDate: string | null) => void;
  teamMembers?: TeamMember[];
  onChangeAssignee?: (assigneeId: string | null) => void;
  parentProject?: { id: string; title: string };
  siblingProjects?: SubProject[];
  subProjects?: SubProject[];
  onMoveToSubProject?: (subProjectId: string) => void;
  onCreateAndMove?: (title: string) => void;
  onDelete?: () => void;
  onDeselectAll: () => void;
}

const energyOptions = [
  { label: "None", value: null },
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
];

const statusOptions = [
  { label: "Not started", value: "NOT_STARTED" },
  { label: "In progress", value: "IN_PROGRESS" },
];

const timeOptions = [
  { label: "None", value: null },
  { label: "5m", value: 5 },
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
];

export function BulkActionBar({
  selectionCount,
  contexts,
  onChangeContext,
  onChangeEnergy,
  onChangeTime,
  onChangeStatus,
  onChangeDueDate,
  teamMembers,
  onChangeAssignee,
  parentProject,
  siblingProjects,
  subProjects,
  onMoveToSubProject,
  onCreateAndMove,
  onDelete,
  onDeselectAll,
}: BulkActionBarProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [newSubProjectTitle, setNewSubProjectTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={cn(
        "fixed z-50",
        "bottom-[calc(1rem+56px+env(safe-area-inset-bottom))] md:bottom-4",
        "left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto",
        "flex flex-wrap md:flex-nowrap items-center justify-center md:justify-start gap-2 rounded-lg border bg-background px-3 py-2 md:px-3 md:py-1.5 shadow-lg",
        "animate-in slide-in-from-bottom-4 fade-in duration-200"
      )}
    >
      <span className="text-sm font-medium whitespace-nowrap">
        <span className="hidden md:inline">{selectionCount} selected</span><span className="md:hidden">Sel:{selectionCount}</span>
      </span>

      {/* Delete — first so it's farthest from thumb on mobile */}
      {onDelete && !confirmDelete && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 md:h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      )}
      {onDelete && confirmDelete && (
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5 md:h-7"
          onClick={() => { setConfirmDelete(false); onDelete(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Confirm delete {selectionCount}
        </Button>
      )}

      {/* Context */}
      <Popover open={contextOpen} onOpenChange={setContextOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
            <MapPin className="h-3.5 w-3.5" />
            Context
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="center" side="top">
          <button
            onClick={() => { setContextOpen(false); onChangeContext(null); }}
            className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
          >
            No context
          </button>
          {contexts.map((ctx) => (
            <button
              key={ctx.id}
              onClick={() => { setContextOpen(false); onChangeContext(ctx.id); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors flex items-center gap-2"
            >
              {ctx.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: ctx.color }}
                />
              )}
              {ctx.name}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Energy */}
      <Popover open={energyOpen} onOpenChange={setEnergyOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
            <Zap className="h-3.5 w-3.5" />
            Energy
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="center" side="top">
          {energyOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => { setEnergyOpen(false); onChangeEnergy(opt.value); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Time estimate */}
      <Popover open={timeOpen} onOpenChange={setTimeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
            <Clock className="h-3.5 w-3.5" />
            Time
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="center" side="top">
          {timeOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => { setTimeOpen(false); onChangeTime(opt.value); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Status */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
            <Circle className="h-3.5 w-3.5" />
            Status
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="center" side="top">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusOpen(false); onChangeStatus(opt.value); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Due date */}
      {onChangeDueDate && (
        <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
              <Calendar className="h-3.5 w-3.5" />
              Due
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="center" side="top">
            <div className="space-y-1">
              <Input
                type="date"
                className="h-8 text-sm"
                onChange={(e) => {
                  setDueDateOpen(false);
                  onChangeDueDate(
                    e.target.value
                      ? new Date(e.target.value + "T00:00:00").toISOString()
                      : null
                  );
                }}
              />
              <button
                onClick={() => { setDueDateOpen(false); onChangeDueDate(null); }}
                className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                Clear due date
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Assignee */}
      {onChangeAssignee && teamMembers && teamMembers.length > 0 && (
        <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
              <User className="h-3.5 w-3.5" />
              Assign
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="center" side="top">
            <button
              onClick={() => { setAssigneeOpen(false); onChangeAssignee(null); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              Unassigned
            </button>
            {teamMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => { setAssigneeOpen(false); onChangeAssignee(m.id); }}
                className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
              >
                {m.name || m.email}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Move to sub-project */}
      {onMoveToSubProject && (
        <Popover open={moveOpen} onOpenChange={(open) => { setMoveOpen(open); if (!open) setNewSubProjectTitle(""); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 md:h-7">
              <FolderOutput className="h-3.5 w-3.5" />
              Move
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="center" side="top">
            {parentProject && (
              <>
                <button
                  onClick={() => { setMoveOpen(false); onMoveToSubProject(parentProject.id); }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors truncate text-muted-foreground"
                >
                  &larr; {parentProject.title}
                </button>
                {((siblingProjects && siblingProjects.length > 0) || (subProjects && subProjects.length > 0) || onCreateAndMove) && (
                  <div className="border-t my-1" />
                )}
              </>
            )}
            {siblingProjects && siblingProjects.length > 0 && (
              <>
                {siblingProjects.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => { setMoveOpen(false); onMoveToSubProject(sp.id); }}
                    className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors truncate"
                  >
                    {sp.title}
                  </button>
                ))}
                {((subProjects && subProjects.length > 0) || onCreateAndMove) && (
                  <div className="border-t my-1" />
                )}
              </>
            )}
            {subProjects && subProjects.length > 0 && (
              <>
                {subProjects.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => { setMoveOpen(false); onMoveToSubProject(sp.id); }}
                    className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors truncate"
                  >
                    {sp.title}
                  </button>
                ))}
                {onCreateAndMove && (
                  <div className="border-t my-1" />
                )}
              </>
            )}
            {onCreateAndMove && (
              <div className="flex gap-1 p-1">
                <Input
                  value={newSubProjectTitle}
                  onChange={(e) => setNewSubProjectTitle(e.target.value)}
                  placeholder="New sub-project..."
                  className="h-7 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSubProjectTitle.trim()) {
                      setMoveOpen(false);
                      onCreateAndMove(newSubProjectTitle.trim());
                      setNewSubProjectTitle("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-7 px-2 shrink-0"
                  disabled={!newSubProjectTitle.trim()}
                  onClick={() => {
                    if (newSubProjectTitle.trim()) {
                      setMoveOpen(false);
                      onCreateAndMove(newSubProjectTitle.trim());
                      setNewSubProjectTitle("");
                    }
                  }}
                >
                  Create
                </Button>
              </div>
            )}
            {(!subProjects || subProjects.length === 0) && !onCreateAndMove && (
              <p className="px-3 py-1.5 text-sm text-muted-foreground">No sub-projects</p>
            )}
          </PopoverContent>
        </Popover>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => { setConfirmDelete(false); onDeselectAll(); }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
