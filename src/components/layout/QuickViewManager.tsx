"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, GripVertical, Check, X } from "lucide-react";
import { TeamIcon } from "@/components/teams/team-icons";
import { type QuickView, iconMap } from "./quick-view-types";

interface QuickViewManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quickViews: QuickView[];
  onSave: (views: QuickView[]) => void;
}

interface ContextData {
  id: string;
  name: string;
  color: string | null;
}

interface TeamData {
  id: string;
  name: string;
  icon?: string | null;
}

const iconOptions = Object.keys(iconMap);

const energyOptions = [
  { label: "Any energy", value: "" },
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
];

const colorOptions = [
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#6366f1",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const dueOptions = [
  { label: "Any due date", value: "" },
  { label: "Overdue", value: "overdue" },
  { label: "Today", value: "today" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
];

const statusOptions = [
  { label: "Any status", value: "" },
  { label: "Not Started", value: "NOT_STARTED" },
  { label: "In Progress", value: "IN_PROGRESS" },
];

const projectFilterOptions = [
  { label: "Any project", value: "" },
  { label: "No project (loose tasks)", value: "none" },
  { label: "In a project", value: "in_project" },
];

const sourceOptions = [
  { label: "Any source", value: "" },
  { label: "Card File (recurring)", value: "card-file" },
  { label: "Regular tasks", value: "regular" },
];

const sortOptions = [
  { label: "Default sort", value: "" },
  { label: "By project", value: "project" },
  { label: "By due date", value: "due" },
  { label: "By context", value: "context" },
  { label: "By energy", value: "energy" },
];

interface EditFormState {
  name: string;
  icon: string;
  context: string;
  energy: string;
  maxTime: string;
  scope: string;
  due: string;
  status: string;
  project: string;
  source: string;
  sort: string;
  color: string;
}

const emptyForm: EditFormState = {
  name: "",
  icon: "Bookmark",
  context: "",
  energy: "",
  maxTime: "",
  scope: "",
  due: "",
  status: "",
  project: "",
  source: "",
  sort: "",
  color: "#3b82f6",
};

function formToQuickView(form: EditFormState, id?: string): QuickView {
  const params: Record<string, string> = {};
  if (form.context) params.context = form.context;
  if (form.energy) params.energy = form.energy;
  if (form.maxTime) params.maxTime = form.maxTime;
  if (form.scope) params.scope = form.scope;
  if (form.due) params.due = form.due;
  if (form.status) params.status = form.status;
  if (form.project) params.project = form.project;
  if (form.source) params.source = form.source;
  if (form.sort) params.sort = form.sort;
  return {
    id: id || generateId(),
    name: form.name,
    icon: form.icon,
    params,
    color: form.color,
  };
}

function quickViewToForm(view: QuickView): EditFormState {
  return {
    name: view.name,
    icon: view.icon,
    context: view.params.context || "",
    energy: view.params.energy || "",
    maxTime: view.params.maxTime || "",
    scope: view.params.scope || "",
    due: view.params.due || "",
    status: view.params.status || "",
    project: view.params.project || "",
    source: view.params.source || "",
    sort: view.params.sort || "",
    color: view.color,
  };
}

export function QuickViewManager({
  open,
  onOpenChange,
  quickViews,
  onSave,
}: QuickViewManagerProps) {
  const [views, setViews] = useState<QuickView[]>(quickViews);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<EditFormState>(emptyForm);
  const [contexts, setContexts] = useState<ContextData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Sync views when props change
  useEffect(() => {
    setViews(quickViews);
  }, [quickViews]);

  // Fetch contexts and teams for the dropdowns
  const fetchData = useCallback(async () => {
    try {
      const [ctxRes, teamsRes] = await Promise.all([
        fetch("/api/contexts"),
        fetch("/api/teams"),
      ]);
      if (ctxRes.ok) {
        setContexts(await ctxRes.json());
      }
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(teamsData.teams || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      setEditingId(null);
      setIsAdding(false);
      setForm(emptyForm);
    }
  }, [open, fetchData]);

  function handleDelete(id: string) {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }

  function handleStartEdit(view: QuickView) {
    setEditingId(view.id);
    setIsAdding(false);
    setForm(quickViewToForm(view));
  }

  function handleStartAdd() {
    setIsAdding(true);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setIsAdding(false);
    setForm(emptyForm);
  }

  function handleSaveEdit() {
    if (!form.name.trim()) return;

    if (editingId) {
      setViews((prev) =>
        prev.map((v) =>
          v.id === editingId ? formToQuickView(form, editingId) : v
        )
      );
      setEditingId(null);
    } else if (isAdding) {
      setViews((prev) => [...prev, formToQuickView(form)]);
      setIsAdding(false);
    }
    setForm(emptyForm);
  }

  function handleSaveAll() {
    onSave(views);
    onOpenChange(false);
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newViews = [...views];
    const [moved] = newViews.splice(dragIndex, 1);
    newViews.splice(index, 0, moved);
    setViews(newViews);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  const isFormActive = editingId !== null || isAdding;
  const formHasParams = form.context || form.energy || form.maxTime || form.scope || form.due || form.status || form.project || form.source || form.sort;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Quick Views</DialogTitle>
          <DialogDescription>
            Add, edit, or reorder your saved filter presets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {views.map((view, index) => {
            const Icon = iconMap[view.icon];
            const isEditing = editingId === view.id;

            if (isEditing) return null; // rendered below as form

            return (
              <div
                key={view.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
                  dragIndex === index && "opacity-50"
                )}
              >
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground shrink-0" />
                {Icon && (
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: view.color }}
                  />
                )}
                <span className="flex-1 truncate">{view.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => handleStartEdit(view)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(view.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>

        {isFormActive && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {editingId ? "Edit Quick View" : "Add Quick View"}
              </p>

              {/* Name */}
              <div className="space-y-1">
                <Label htmlFor="qv-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="qv-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Low Energy @Home"
                  className="h-8 text-sm"
                />
              </div>

              {/* Icon picker */}
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <div className="flex flex-wrap gap-1">
                  {iconOptions.map((iconName) => {
                    const IconComp = iconMap[iconName];
                    return (
                      <Button
                        key={iconName}
                        variant={form.icon === iconName ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, icon: iconName }))
                        }
                        title={iconName}
                      >
                        <IconComp className="h-3.5 w-3.5" />
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Color picker */}
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex gap-1">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-all",
                        form.color === color
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, color }))
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Context filter */}
              <div className="space-y-1">
                <Label className="text-xs">Context</Label>
                <Select
                  value={form.context || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      context: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any context</SelectItem>
                    {contexts.map((ctx) => (
                      <SelectItem key={ctx.id} value={ctx.name}>
                        {ctx.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Scope filter */}
              {teams.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Scope</Label>
                  <Select
                    value={form.scope || "none"}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        scope: v === "none" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Any scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any scope</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          <span className="inline-flex items-center gap-1.5"><TeamIcon icon={team.icon} className="h-3.5 w-3.5" />{team.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Energy filter */}
              <div className="space-y-1">
                <Label className="text-xs">Energy Level</Label>
                <Select
                  value={form.energy || "any"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      energy: v === "any" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any energy" />
                  </SelectTrigger>
                  <SelectContent>
                    {energyOptions.map((opt) => (
                      <SelectItem
                        key={opt.value || "any"}
                        value={opt.value || "any"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Max time */}
              <div className="space-y-1">
                <Label htmlFor="qv-time" className="text-xs">
                  Max Time (minutes)
                </Label>
                <Input
                  id="qv-time"
                  type="number"
                  min="0"
                  value={form.maxTime}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, maxTime: e.target.value }))
                  }
                  placeholder="e.g. 15"
                  className="h-8 text-sm"
                />
              </div>

              {/* Due date filter */}
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Select
                  value={form.due || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      due: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any due date" />
                  </SelectTrigger>
                  <SelectContent>
                    {dueOptions.map((opt) => (
                      <SelectItem
                        key={opt.value || "none"}
                        value={opt.value || "none"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status filter */}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      status: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem
                        key={opt.value || "none"}
                        value={opt.value || "none"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Project filter */}
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select
                  value={form.project || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      project: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectFilterOptions.map((opt) => (
                      <SelectItem
                        key={opt.value || "none"}
                        value={opt.value || "none"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Source filter */}
              <div className="space-y-1">
                <Label className="text-xs">Source</Label>
                <Select
                  value={form.source || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      source: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any source" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((opt) => (
                      <SelectItem
                        key={opt.value || "none"}
                        value={opt.value || "none"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="space-y-1">
                <Label className="text-xs">Sort</Label>
                <Select
                  value={form.sort || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      sort: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Default sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((opt) => (
                      <SelectItem
                        key={opt.value || "none"}
                        value={opt.value || "none"}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Form actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSaveEdit}
                  disabled={!form.name.trim() || !formHasParams}
                >
                  <Check className="h-3 w-3 mr-1" />
                  {editingId ? "Update" : "Add"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCancelEdit}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}

        <Separator />

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {!isFormActive && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleStartAdd}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Quick View
            </Button>
          )}
          <div className={cn(!isFormActive && "ml-auto")}>
            <Button size="sm" className="text-xs" onClick={handleSaveAll}>
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
