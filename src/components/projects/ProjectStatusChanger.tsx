"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check, Pause, XCircle, Archive, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ON_HOLD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COMPLETED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DROPPED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  SOMEDAY_MAYBE: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const statusOptions = [
  { value: "ACTIVE", label: "Active", icon: Check, description: "Project is actively being worked on" },
  { value: "ON_HOLD", label: "On Hold", icon: Pause, description: "Temporarily paused" },
  { value: "COMPLETED", label: "Completed", icon: Archive, description: "All tasks done, project finished" },
  { value: "DROPPED", label: "Dropped", icon: XCircle, description: "No longer pursuing this project" },
  { value: "SOMEDAY_MAYBE", label: "Someday/Maybe", icon: Lightbulb, description: "Park for later review" },
];

interface ProjectStatusChangerProps {
  currentStatus: string;
  onStatusChange: (status: string, note?: string) => Promise<void>;
  isTeamProject?: boolean;
}

export function ProjectStatusChanger({
  currentStatus,
  onStatusChange,
  isTeamProject,
}: ProjectStatusChangerProps) {
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [statusNote, setStatusNote] = useState("");

  async function handleStatusChange(newStatus: string) {
    // Require confirmation for COMPLETED, DROPPED, and SOMEDAY_MAYBE
    if (newStatus === "COMPLETED" || newStatus === "DROPPED" || newStatus === "SOMEDAY_MAYBE") {
      setConfirmDialog(newStatus);
      setStatusNote("");
      return;
    }
    // For team projects, ON_HOLD also gets a note prompt
    if (isTeamProject && newStatus === "ON_HOLD") {
      setConfirmDialog(newStatus);
      setStatusNote("");
      return;
    }
    await doChange(newStatus);
  }

  async function doChange(newStatus: string, note?: string) {
    setChanging(true);
    try {
      await onStatusChange(newStatus, note);
    } finally {
      setChanging(false);
      setConfirmDialog(null);
      setStatusNote("");
    }
  }

  const confirmOption = statusOptions.find((o) => o.value === confirmDialog);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={changing} className="gap-1">
            <Badge variant="secondary" className={cn("text-xs", statusColors[currentStatus])}>
              {currentStatus.replace("_", " ")}
            </Badge>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {statusOptions.map((option, idx) => (
            <div key={option.value}>
              {(idx === 2 || idx === 4) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => handleStatusChange(option.value)}
                disabled={option.value === currentStatus}
                className="flex items-center gap-2"
              >
                <option.icon className="h-4 w-4" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
                {option.value === currentStatus && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation dialog for destructive actions */}
      <Dialog open={!!confirmDialog} onOpenChange={() => { setConfirmDialog(null); setStatusNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog === "COMPLETED"
                ? "Complete this project?"
                : confirmDialog === "ON_HOLD"
                  ? "Put project on hold?"
                  : confirmDialog === "SOMEDAY_MAYBE"
                    ? "Move to Someday/Maybe?"
                    : "Drop this project?"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog === "COMPLETED"
                ? "This will mark the project and all its tasks as completed. You can reactivate it later if needed."
                : confirmDialog === "ON_HOLD"
                  ? "This will pause the project. You can reactivate it anytime."
                  : confirmDialog === "SOMEDAY_MAYBE"
                    ? "This will park the project for later review. You can reactivate it anytime."
                    : "This will mark the project as dropped. Any remaining tasks will stay as-is. You can reactivate it later if needed."}
            </DialogDescription>
          </DialogHeader>
          {isTeamProject && (
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Add context for your team (optional)
              </label>
              <Textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="e.g. Waiting on budget approval..."
                rows={2}
                className="text-sm"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmDialog(null); setStatusNote(""); }}
              disabled={changing}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog === "DROPPED" ? "destructive" : "default"}
              onClick={() => confirmDialog && doChange(confirmDialog, statusNote.trim() || undefined)}
              disabled={changing}
            >
              {changing
                ? "Updating..."
                : confirmOption
                  ? `${confirmOption.label} Project`
                  : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
