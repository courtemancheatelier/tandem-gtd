"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Layers, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { AreaCard, type AreaData } from "@/components/areas/AreaCard";
import { AreaForm } from "@/components/areas/AreaForm";
import { HelpLink } from "@/components/shared/HelpLink";

export default function AreasPage() {
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaData | null>(null);
  const { toast } = useToast();

  const fetchAreas = useCallback(async () => {
    const url = showInactive ? "/api/areas" : "/api/areas?active=true";
    const res = await fetch(url);
    if (res.ok) {
      setAreas(await res.json());
    }
    setLoading(false);
  }, [showInactive]);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  async function createArea(data: { name: string; description?: string }) {
    const res = await fetch("/api/areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setCreateDialogOpen(false);
      toast({ title: "Area created", description: `"${data.name}" has been added.` });
      fetchAreas();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to create area", variant: "destructive" });
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
      fetchAreas();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to update area", variant: "destructive" });
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/areas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      fetchAreas();
    } else {
      toast({ title: "Error", description: "Failed to update area", variant: "destructive" });
    }
  }

  async function deleteArea(id: string) {
    const area = areas.find((a) => a.id === id);
    if (!area) return;

    if (area.projectCount > 0 || area.goalCount > 0) {
      const confirmed = window.confirm(
        `"${area.name}" has ${area.projectCount} project(s) and ${area.goalCount} goal(s). ` +
        `These will be unlinked from this area. Continue?`
      );
      if (!confirmed) return;
    }

    const res = await fetch(`/api/areas/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Area deleted", description: `"${area.name}" has been removed.` });
      fetchAreas();
    } else {
      toast({ title: "Error", description: "Failed to delete area", variant: "destructive" });
    }
  }

  async function reorderArea(id: string, direction: "up" | "down") {
    const index = areas.findIndex((a) => a.id === id);
    if (index === -1) return;

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= areas.length) return;

    // Swap sort orders
    const currentOrder = areas[index].sortOrder;
    const swapOrder = areas[swapIndex].sortOrder;

    // Optimistically update the UI
    const newAreas = [...areas];
    const temp = newAreas[index];
    newAreas[index] = { ...newAreas[swapIndex], sortOrder: currentOrder };
    newAreas[swapIndex] = { ...temp, sortOrder: swapOrder };
    setAreas(newAreas);

    // Persist both changes
    await Promise.all([
      fetch(`/api/areas/${areas[index].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swapOrder }),
      }),
      fetch(`/api/areas/${areas[swapIndex].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: currentOrder }),
      }),
    ]);

    fetchAreas();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeAreas = areas.filter((a) => a.isActive);
  const inactiveAreas = areas.filter((a) => !a.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Areas of Focus
            <HelpLink slug="organize" />
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeAreas.length} active area{activeAreas.length !== 1 ? "s" : ""} of responsibility
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Area
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Area of Responsibility</DialogTitle>
              </DialogHeader>
              <AreaForm
                onSubmit={createArea}
                onCancel={() => setCreateDialogOpen(false)}
                submitLabel="Create Area"
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator />

      {/* Active Areas */}
      {activeAreas.length > 0 ? (
        <div className="grid gap-3">
          {activeAreas.map((area, index) => (
            <AreaCard
              key={area.id}
              area={area}
              onToggleActive={toggleActive}
              onEdit={setEditingArea}
              onDelete={deleteArea}
              onMoveUp={(id) => reorderArea(id, "up")}
              onMoveDown={(id) => reorderArea(id, "down")}
              isFirst={index === 0}
              isLast={index === activeAreas.length - 1}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Layers className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              No areas of responsibility yet. Create one to organize your projects and goals!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Inactive Areas */}
      {showInactive && inactiveAreas.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-muted-foreground">Inactive</h2>
          <div className="grid gap-3">
            {inactiveAreas.map((area, index) => (
              <AreaCard
                key={area.id}
                area={area}
                onToggleActive={toggleActive}
                onEdit={setEditingArea}
                onDelete={deleteArea}
                onMoveUp={(id) => reorderArea(id, "up")}
                onMoveDown={(id) => reorderArea(id, "down")}
                isFirst={index === 0}
                isLast={index === inactiveAreas.length - 1}
              />
            ))}
          </div>
        </>
      )}

      {/* Edit Area Dialog */}
      <Dialog open={!!editingArea} onOpenChange={(open) => !open && setEditingArea(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Area</DialogTitle>
          </DialogHeader>
          {editingArea && (
            <AreaForm
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
