"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { SchedulePicker } from "./SchedulePicker";

interface TaskDefaults {
  projectId?: string | null;
  contextId?: string | null;
  energyLevel?: string | null;
  estimatedMins?: number | null;
}

interface RecurringTemplate {
  id: string;
  title: string;
  description?: string | null;
  cronExpression: string;
  taskDefaults?: TaskDefaults | null;
  isActive: boolean;
  nextDue?: string | null;
  color?: string | null;
  estimatedMins?: number | null;
  areaId?: string | null;
  goalId?: string | null;
}

interface Project {
  id: string;
  title: string;
}

interface Context {
  id: string;
  name: string;
}

interface Area {
  id: string;
  name: string;
}

interface Goal {
  id: string;
  title: string;
}

interface RecurringTemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: RecurringTemplate | null;
  onSaved: () => void;
}

export function RecurringTemplateForm({
  open,
  onOpenChange,
  template,
  onSaved,
}: RecurringTemplateFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("daily");
  const [color, setColor] = useState<string>("");
  const [templateEstimatedMins, setTemplateEstimatedMins] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [contextId, setContextId] = useState<string>("");
  const [energyLevel, setEnergyLevel] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const isEditing = !!template;

  // Fetch projects and contexts for the dropdowns
  useEffect(() => {
    if (open) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((data) => setProjects(Array.isArray(data) ? data : []))
        .catch(() => setProjects([]));

      fetch("/api/contexts")
        .then((r) => r.json())
        .then((data) => setContexts(Array.isArray(data) ? data : []))
        .catch(() => setContexts([]));

      fetch("/api/areas")
        .then((r) => r.json())
        .then((data) => setAreas(Array.isArray(data) ? data : []))
        .catch(() => setAreas([]));

      fetch("/api/goals")
        .then((r) => r.json())
        .then((data) => setGoals(Array.isArray(data) ? data : []))
        .catch(() => setGoals([]));
    }
  }, [open]);

  // Populate form when editing
  useEffect(() => {
    if (template) {
      setTitle(template.title);
      setDescription(template.description || "");
      setCronExpression(template.cronExpression);
      setColor(template.color || "");
      setTemplateEstimatedMins(
        template.estimatedMins ? String(template.estimatedMins) : ""
      );
      setAreaId(template.areaId || "");
      setGoalId(template.goalId || "");
      const defaults = template.taskDefaults || {};
      setProjectId(defaults.projectId || "");
      setContextId(defaults.contextId || "");
      setEnergyLevel(defaults.energyLevel || "");
    } else {
      setTitle("");
      setDescription("");
      setCronExpression("daily");
      setColor("");
      setTemplateEstimatedMins("");
      setAreaId("");
      setGoalId("");
      setProjectId("");
      setContextId("");
      setEnergyLevel("");
    }
  }, [template, open]);

  const handleScheduleChange = useCallback((value: string) => {
    setCronExpression(value);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);

    const parsedTemplateEstMins = parseInt(templateEstimatedMins, 10);
    const hasValidTime = !isNaN(parsedTemplateEstMins) && parsedTemplateEstMins > 0;

    const cleanVal = (v: string) => (v && v !== "none" ? v : undefined);

    const taskDefaults: TaskDefaults = {};
    if (cleanVal(projectId)) taskDefaults.projectId = projectId;
    if (cleanVal(contextId)) taskDefaults.contextId = contextId;
    if (cleanVal(energyLevel)) taskDefaults.energyLevel = energyLevel;
    if (hasValidTime) taskDefaults.estimatedMins = parsedTemplateEstMins;

    const validId = (v: string) => (v && v !== "none" ? v : null);

    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      cronExpression,
      color: color || undefined,
      estimatedMins: hasValidTime ? parsedTemplateEstMins : undefined,
      areaId: validId(areaId) ?? (isEditing ? null : undefined),
      goalId: validId(goalId) ?? (isEditing ? null : undefined),
      taskDefaults: Object.keys(taskDefaults).length > 0 ? taskDefaults : undefined,
    };

    try {
      const url = isEditing
        ? `/api/recurring-templates/${template.id}`
        : "/api/recurring-templates";

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save template");
      }

      toast({
        title: isEditing ? "Template updated" : "Template created",
        description: isEditing
          ? "Your recurring template has been updated."
          : "Your recurring template has been created.",
      });

      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Recurring Template" : "New Recurring Template"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update this recurring task template."
                : "Create a template that generates tasks on a schedule."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="template-title">Task Title</Label>
              <Input
                id="template-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Weekly inbox review"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="template-description">
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="template-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes that will be added to each generated task"
                rows={3}
              />
            </div>

            {/* Schedule */}
            <SchedulePicker
              value={cronExpression}
              onChange={handleScheduleChange}
            />

            {/* Color & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="template-color">Card Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="template-color"
                    type="color"
                    value={color || "#6366f1"}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-9 rounded border cursor-pointer"
                  />
                  {color && (
                    <button
                      type="button"
                      onClick={() => setColor("")}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="template-card-estimate">
                  Time Estimate (min)
                </Label>
                <Input
                  id="template-card-estimate"
                  type="number"
                  min={1}
                  value={templateEstimatedMins}
                  onChange={(e) => setTemplateEstimatedMins(e.target.value)}
                  placeholder="e.g., 15"
                />
              </div>
            </div>

            {/* GTD Horizons */}
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Horizons{" "}
                <span className="text-muted-foreground font-normal">
                  (link to an area or goal)
                </span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* Area */}
                <div className="space-y-1.5">
                  <Label>Area</Label>
                  <Select value={areaId} onValueChange={setAreaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="No area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No area</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Goal */}
                <div className="space-y-1.5">
                  <Label>Goal</Label>
                  <Select value={goalId} onValueChange={setGoalId}>
                    <SelectTrigger>
                      <SelectValue placeholder="No goal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No goal</SelectItem>
                      {goals.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Task Defaults */}
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Task Defaults{" "}
                <span className="text-muted-foreground font-normal">
                  (applied to generated tasks)
                </span>
              </p>

              {/* Project */}
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Context */}
              <div className="space-y-1.5">
                <Label>Context</Label>
                <Select value={contextId} onValueChange={setContextId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No context</SelectItem>
                    {contexts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Energy Level */}
              <div className="space-y-1.5">
                <Label>Energy Level</Label>
                <Select value={energyLevel} onValueChange={setEnergyLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any energy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any energy</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving
                ? "Saving..."
                : isEditing
                  ? "Update Template"
                  : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
