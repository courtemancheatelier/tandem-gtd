"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiffDisplay } from "./DiffDisplay";
import { AlertTriangle, RotateCcw, Loader2 } from "lucide-react";

interface RevertConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshotId: string;
  taskId: string;
  snapshotDate: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  onConfirm: () => Promise<void>;
}

export function RevertConfirmDialog({
  open,
  onOpenChange,
  snapshotDate,
  changes,
  onConfirm,
}: RevertConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const changeCount = Object.keys(changes).length;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Error handling is done by the parent
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Revert Task
          </DialogTitle>
          <DialogDescription>
            This will revert the task to its state from{" "}
            <span className="font-medium text-foreground">
              {new Date(snapshotDate).toLocaleString()}
            </span>
            . A new history event will be recorded.
          </DialogDescription>
        </DialogHeader>

        {/* Show what will change */}
        {changeCount > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {changeCount} field{changeCount !== 1 ? "s" : ""} will be changed:
            </p>
            <div className="max-h-60 overflow-y-auto rounded-md border p-3 bg-muted/30">
              <DiffDisplay changes={changes} />
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            This action will overwrite the current task state with the snapshot
            values shown above. A snapshot of the current state will be saved
            before reverting, so you can undo this if needed.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Revert to Snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
