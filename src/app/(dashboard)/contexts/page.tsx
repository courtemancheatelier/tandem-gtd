"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tag,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { HelpLink } from "@/components/shared/HelpLink";

interface ContextData {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  _count?: { tasks: number };
}

const DEFAULT_CONTEXTS = [
  { name: "@Computer", color: "#8B5CF6", sortOrder: 0 },
  { name: "@Phone", color: "#F59E0B", sortOrder: 1 },
  { name: "@Office", color: "#3B82F6", sortOrder: 2 },
  { name: "@Home", color: "#10B981", sortOrder: 3 },
  { name: "@Errands", color: "#EF4444", sortOrder: 4 },
  { name: "@Anywhere", color: "#6B7280", sortOrder: 5 },
  { name: "@Agenda", color: "#EC4899", sortOrder: 6 },
];

export default function ContextsPage() {
  const [contexts, setContexts] = useState<ContextData[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingContext, setEditingContext] = useState<ContextData | null>(null);
  const seededRef = useRef(false);
  const { toast } = useToast();

  const fetchContexts = useCallback(async () => {
    const res = await fetch("/api/contexts");
    if (res.ok) {
      const data = await res.json();
      return data as ContextData[];
    }
    return null;
  }, []);

  useEffect(() => {
    async function init() {
      const data = await fetchContexts();
      if (data) {
        if (data.length === 0 && !seededRef.current) {
          seededRef.current = true;
          await seedDefaults();
          const refreshed = await fetchContexts();
          if (refreshed) setContexts(refreshed);
        } else {
          setContexts(data);
        }
      }
      setLoading(false);
    }
    init();
  }, [fetchContexts]);

  async function seedDefaults() {
    for (const ctx of DEFAULT_CONTEXTS) {
      await fetch("/api/contexts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
    }
  }

  async function refreshContexts() {
    const data = await fetchContexts();
    if (data) setContexts(data);
  }

  async function createContext(name: string, color: string) {
    const maxSort = contexts.reduce((max, c) => Math.max(max, c.sortOrder), -1);
    const res = await fetch("/api/contexts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, sortOrder: maxSort + 1 }),
    });
    if (res.ok) {
      setCreateDialogOpen(false);
      toast({ title: "Context created", description: `"${name}" has been added.` });
      refreshContexts();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to create context", variant: "destructive" });
    }
  }

  async function updateContext(name: string, color: string) {
    if (!editingContext) return;
    const res = await fetch(`/api/contexts/${editingContext.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (res.ok) {
      setEditingContext(null);
      toast({ title: "Context updated", description: `"${name}" has been saved.` });
      refreshContexts();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to update context", variant: "destructive" });
    }
  }

  async function deleteContext(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;

    const confirmed = window.confirm(
      `Delete "${ctx.name}"? Tasks using this context will have their context cleared.`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/contexts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Context deleted", description: `"${ctx.name}" has been removed.` });
      refreshContexts();
    } else {
      toast({ title: "Error", description: "Failed to delete context", variant: "destructive" });
    }
  }

  async function reorderContext(id: string, direction: "up" | "down") {
    const index = contexts.findIndex((c) => c.id === id);
    if (index === -1) return;

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= contexts.length) return;

    const currentOrder = contexts[index].sortOrder;
    const swapOrder = contexts[swapIndex].sortOrder;

    // Optimistic update
    const newContexts = [...contexts];
    const temp = newContexts[index];
    newContexts[index] = { ...newContexts[swapIndex], sortOrder: currentOrder };
    newContexts[swapIndex] = { ...temp, sortOrder: swapOrder };
    setContexts(newContexts);

    await Promise.all([
      fetch(`/api/contexts/${contexts[index].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swapOrder }),
      }),
      fetch(`/api/contexts/${contexts[swapIndex].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: currentOrder }),
      }),
    ]);

    refreshContexts();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6" />
            Contexts
            <HelpLink slug="organize" />
          </h1>
          <p className="text-muted-foreground mt-1">
            {contexts.length} context{contexts.length !== 1 ? "s" : ""} &mdash; where or how you can do work
          </p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Context
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Context</DialogTitle>
            </DialogHeader>
            <ContextForm
              onSubmit={createContext}
              onCancel={() => setCreateDialogOpen(false)}
              submitLabel="Create Context"
            />
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {contexts.length > 0 ? (
        <div className="grid gap-2">
          {contexts.map((ctx, index) => (
            <Card key={ctx.id}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ backgroundColor: ctx.color || "#6B7280" }}
                />
                <span className="font-medium flex-1">{ctx.name}</span>
                {ctx._count && (
                  <span className="text-xs text-muted-foreground">
                    {ctx._count.tasks} task{ctx._count.tasks !== 1 ? "s" : ""}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => reorderContext(ctx.id, "up")}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === contexts.length - 1}
                    onClick={() => reorderContext(ctx.id, "down")}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditingContext(ctx)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteContext(ctx.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Tag className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              No contexts yet. Click &ldquo;Add Context&rdquo; to create one.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Context Dialog */}
      <Dialog open={!!editingContext} onOpenChange={(open) => !open && setEditingContext(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Context</DialogTitle>
          </DialogHeader>
          {editingContext && (
            <ContextForm
              initialName={editingContext.name}
              initialColor={editingContext.color || "#6B7280"}
              onSubmit={updateContext}
              onCancel={() => setEditingContext(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextForm({
  initialName = "",
  initialColor = "#8B5CF6",
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initialName?: string;
  initialColor?: string;
  onSubmit: (name: string, color: string) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim(), color);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="context-name">Name</Label>
        <Input
          id="context-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="@Computer"
          maxLength={50}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="context-color">Color</Label>
        <div className="flex items-center gap-3">
          <input
            id="context-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-10 rounded border border-input cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">{color}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
