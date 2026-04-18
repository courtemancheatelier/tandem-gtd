"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle } from "lucide-react";
import { type ReactNode } from "react";

interface TeamCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onConfirm: (note?: string) => void;
}

export function TeamCompleteDialog({
  open,
  onOpenChange,
  taskTitle,
  onConfirm,
}: TeamCompleteDialogProps) {
  return (
    <TeamNoteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Complete task"
      description={taskTitle}
      icon={<CheckCircle className="h-5 w-5 text-green-600" />}
      placeholder="e.g. Shipped to staging, needs QA review..."
      onConfirm={onConfirm}
    />
  );
}

// ---------------------------------------------------------------------------
// Generic team note dialog — reused for completion, reassignment, status change
// ---------------------------------------------------------------------------

interface TeamNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  icon: ReactNode;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (note?: string) => void;
}

export function TeamNoteDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  placeholder = "Add context for your team...",
  confirmLabel = "Confirm",
  onConfirm,
}: TeamNoteDialogProps) {
  const [note, setNote] = useState("");

  function handleConfirm() {
    onConfirm(note.trim() || undefined);
    setNote("");
  }

  function handleSkip() {
    onConfirm(undefined);
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[110]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription className="truncate">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
            Add context for your team (optional)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="text-sm"
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
