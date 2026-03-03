"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AreaForm } from "@/components/areas/AreaForm";
import { useToast } from "@/components/ui/use-toast";
import type { AreaData } from "@/components/areas/AreaCard";
import {
  Plus,
  Pencil,
  Trash2,
  FolderKanban,
  Target,
} from "lucide-react";

interface AreaListProps {
  areas: AreaData[];
  onRefresh: () => void;
}

export function AreaList({ areas, onRefresh }: AreaListProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaData | null>(null);
  const { toast } = useToast();

  async function createArea(data: { name: string; description?: string }) {
    const res = await fetch("/api/areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setCreateOpen(false);
      toast({ title: "Area created", description: `"${data.name}" has been added.` });
      onRefresh();
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to create area",
        variant: "destructive",
      });
    }
  }

  async function updateArea(data: { name: string; description?: string }) {
    if (!editingArea) return;
    const res = await fetch(`/api/areas/${editingArea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingArea(null);
      toast({ title: "Area updated", description: `"${data.name}" has been saved.` });
      onRefresh();
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to update area",
        variant: "destructive",
      });
    }
  }

  async function deleteArea(area: AreaData) {
    const confirmed = window.confirm(
      `Delete "${area.name}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/areas/${area.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Area deleted", description: `"${area.name}" has been removed.` });
      onRefresh();
    } else {
      toast({
        title: "Error",
        description: "Failed to delete area",
        variant: "destructive",
      });
    }
  }

  const activeAreas = areas.filter((a) => a.isActive);
  const inactiveAreas = areas.filter((a) => !a.isActive);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">
          Areas ({areas.length})
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Area
        </Button>
      </div>

      {areas.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          No areas defined yet. Add your ongoing areas of responsibility here.
        </p>
      )}

      {activeAreas.length > 0 && (
        <div className="space-y-2">
          {activeAreas.map((area) => (
            <AreaItem
              key={area.id}
              area={area}
              onEdit={() => setEditingArea(area)}
              onDelete={() => deleteArea(area)}
            />
          ))}
        </div>
      )}

      {inactiveAreas.length > 0 && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground font-medium">
            Inactive
          </p>
          <div className="space-y-2 opacity-70">
            {inactiveAreas.map((area) => (
              <AreaItem
                key={area.id}
                area={area}
                onEdit={() => setEditingArea(area)}
                onDelete={() => deleteArea(area)}
              />
            ))}
          </div>
        </>
      )}

      {/* Create Area Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Area of Responsibility</DialogTitle>
            <DialogDescription>
              Define an ongoing area you need to maintain at a standard.
            </DialogDescription>
          </DialogHeader>
          <AreaForm
            onSubmit={createArea}
            onCancel={() => setCreateOpen(false)}
            submitLabel="Create Area"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Area Dialog */}
      <Dialog
        open={!!editingArea}
        onOpenChange={(open) => {
          if (!open) setEditingArea(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Area</DialogTitle>
            <DialogDescription>
              Update the details of this area of responsibility.
            </DialogDescription>
          </DialogHeader>
          {editingArea && (
            <AreaForm
              key={editingArea.id}
              initialName={editingArea.name}
              initialDescription={editingArea.description || ""}
              onSubmit={updateArea}
              onCancel={() => setEditingArea(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AreaItem({
  area,
  onEdit,
  onDelete,
}: {
  area: AreaData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <span className="font-medium">{area.name}</span>
        {area.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {area.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {area.activeProjectCount > 0 && (
            <span className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {area.activeProjectCount} project{area.activeProjectCount !== 1 ? "s" : ""}
            </span>
          )}
          {area.goalCount > 0 && (
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {area.goalCount} goal{area.goalCount !== 1 ? "s" : ""}
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
