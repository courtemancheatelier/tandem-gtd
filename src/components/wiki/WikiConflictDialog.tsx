"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Copy, RefreshCw, Upload } from "lucide-react";

interface WikiConflictDialogProps {
  open: boolean;
  onOverwrite: () => void;
  onDiscard: () => void;
  onCopy: () => void;
}

export function WikiConflictDialog({
  open,
  onOverwrite,
  onDiscard,
  onCopy,
}: WikiConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => onDiscard()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Edit Conflict
          </DialogTitle>
          <DialogDescription>
            This article was edited by someone else since you started editing.
            Choose how to resolve this conflict.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          <Button
            variant="default"
            className="w-full justify-start"
            onClick={onOverwrite}
          >
            <Upload className="h-4 w-4 mr-2" />
            Overwrite with my changes
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onDiscard}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Discard my changes and reload
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onCopy}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy my content to clipboard, then reload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
