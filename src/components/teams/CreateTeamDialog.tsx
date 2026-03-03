"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TeamForm } from "./TeamForm";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string; icon?: string }) => void;
  loading?: boolean;
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: CreateTeamDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Team</DialogTitle>
        </DialogHeader>
        <TeamForm
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Create Team"
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}
