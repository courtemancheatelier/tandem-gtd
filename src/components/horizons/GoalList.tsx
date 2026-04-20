"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { GoalStatusBadge } from "./GoalStatusBadge";
import { GoalForm, type GoalFormData } from "./GoalForm";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  FolderKanban,
} from "lucide-react";

export interface GoalData {
  id: string;
  title: string;
  description?: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "DEFERRED";
  horizon: string;
  targetDate?: string | null;
  progress: number;
  areaId?: string | null;
  area?: { id: string; name: string } | null;
  projectCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface GoalListProps {
  goals: GoalData[];
  onRefresh: () => void;
}

export function GoalList({ goals, onRefresh }: GoalListProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalData | null>(null);
  const { toast } = useToast();

  async function createGoal(data: GoalFormData) {
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, horizon: "HORIZON_3" }),
    });
    if (res.ok) {
      toast({ title: "Goal created", description: `"${data.title}" has been added.` });
      onRefresh();
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to create goal",
        variant: "destructive",
      });
    }
  }

  async function updateGoal(data: GoalFormData) {
    if (!editingGoal) return;
    const res = await fetch(`/api/goals/${editingGoal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingGoal(null);
      toast({ title: "Goal updated", description: `"${data.title}" has been saved.` });
      onRefresh();
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to update goal",
        variant: "destructive",
      });
    }
  }

  async function deleteGoal(goal: GoalData) {
    const confirmed = window.confirm(
      `Delete "${goal.title}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Goal deleted", description: `"${goal.title}" has been removed.` });
      onRefresh();
    } else {
      toast({
        title: "Error",
        description: "Failed to delete goal",
        variant: "destructive",
      });
    }
  }

  const activeGoals = goals.filter(
    (g) => g.status !== "ACHIEVED" && g.status !== "DEFERRED"
  );
  const completedGoals = goals.filter(
    (g) => g.status === "ACHIEVED" || g.status === "DEFERRED"
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">
          Goals ({goals.length})
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Goal
        </Button>
      </div>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          No goals defined yet. Add your 1-2 year objectives here.
        </p>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-2">
          {activeGoals.map((goal) => (
            <GoalItem
              key={goal.id}
              goal={goal}
              onEdit={() => setEditingGoal(goal)}
              onDelete={() => deleteGoal(goal)}
            />
          ))}
        </div>
      )}

      {completedGoals.length > 0 && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground font-medium">
            Achieved / Deferred
          </p>
          <div className="space-y-2 opacity-70">
            {completedGoals.map((goal) => (
              <GoalItem
                key={goal.id}
                goal={goal}
                onEdit={() => setEditingGoal(goal)}
                onDelete={() => deleteGoal(goal)}
              />
            ))}
          </div>
        </>
      )}

      {/* Create Goal Dialog */}
      <GoalForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createGoal}
        mode="create"
      />

      {/* Edit Goal Dialog */}
      <GoalForm
        open={!!editingGoal}
        onOpenChange={(open) => {
          if (!open) setEditingGoal(null);
        }}
        onSubmit={updateGoal}
        initialData={
          editingGoal
            ? {
                title: editingGoal.title,
                description: editingGoal.description || undefined,
                status: editingGoal.status,
                targetDate: editingGoal.targetDate,
                areaId: editingGoal.areaId,
              }
            : null
        }
        mode="edit"
      />
    </div>
  );
}

function GoalItem({
  goal,
  onEdit,
  onDelete,
}: {
  goal: GoalData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const targetDateStr = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{goal.title}</span>
          <GoalStatusBadge status={goal.status} />
        </div>
        {goal.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {goal.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {targetDateStr && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {targetDateStr}
            </span>
          )}
          {goal.area && (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {goal.area.name}
            </span>
          )}
          {(goal.projectCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {goal.projectCount} project{goal.projectCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
