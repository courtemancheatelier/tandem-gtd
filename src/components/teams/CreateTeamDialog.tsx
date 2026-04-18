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

export interface ParentTeamOption {
  id: string;
  name: string;
  icon?: string | null;
}

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string; icon?: string; parentTeamId?: string }) => void;
  loading?: boolean;
  triggerLabel?: string;
  /** Available parent teams for the dropdown (teams where user is ADMIN) */
  parentTeamOptions?: ParentTeamOption[];
  /** Pre-selected and locked parent team ID (when creating from parent dashboard) */
  lockedParentTeamId?: string;
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
  triggerLabel = "New Team",
  parentTeamOptions,
  lockedParentTeamId,
}: CreateTeamDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lockedParentTeamId ? "Create a Group" : "Create a Team"}</DialogTitle>
        </DialogHeader>
        <TeamForm
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={lockedParentTeamId ? "Create Group" : "Create Team"}
          loading={loading}
          parentTeamOptions={parentTeamOptions}
          lockedParentTeamId={lockedParentTeamId}
        />
      </DialogContent>
    </Dialog>
  );
}
