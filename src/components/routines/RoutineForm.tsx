"use client";

import { useState, useEffect } from "react";
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
import { SchedulePicker } from "@/components/recurring/SchedulePicker";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface RampStep {
  fromDay: string;
  toDay: string;
  dosage: string;
}

interface WindowItem {
  name: string;
  dosage: string;
  form: string;
  notes: string;
  rampSteps: RampStep[];
}

interface RoutineWindow {
  title: string;
  targetTime: string;
  constraint: string;
  windowType: WindowType;
  items: WindowItem[];
}

interface Routine {
  id: string;
  title: string;
  description?: string | null;
  cronExpression: string;
  isActive: boolean;
  color?: string | null;
  estimatedMins?: number | null;
  areaId?: string | null;
  goalId?: string | null;
  routineType?: string;
  startDate?: string | null;
  totalDays?: number | null;
  // Simple routine fields
  targetTime?: string | null;
  dueByTime?: string | null;
  progressionBaseValue?: number | null;
  progressionIncrement?: number | null;
  progressionUnit?: string | null;
  progressionFrequency?: string | null;
  progressionStartDate?: string | null;
  targetBedtime?: string | null;
  targetWakeTime?: string | null;
  taskDefaults?: { projectId?: string | null; contextId?: string | null; energyLevel?: string | null; estimatedMins?: number | null } | null;
  windows: {
    id: string;
    title: string;
    targetTime?: string | null;
    sortOrder: number;
    constraint?: string | null;
    windowType?: string | null;
    items: {
      id: string;
      name: string;
      dosage?: string | null;
      form?: string | null;
      notes?: string | null;
      rampSchedule?: { type: string; steps: { fromDay: number; toDay: number; dosage: string }[] } | null;
    }[];
  }[];
}

interface Area {
  id: string;
  name: string;
}

interface Goal {
  id: string;
  title: string;
}

interface RoutineFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routine?: Routine | null;
  onSaved: () => void;
}

const WINDOW_TYPE_OPTIONS = [
  { value: "health", label: "Health" },
  { value: "chores", label: "Chores" },
  { value: "spiritual", label: "Spiritual" },
  { value: "general", label: "General" },
] as const;

type WindowType = typeof WINDOW_TYPE_OPTIONS[number]["value"];

interface WindowTypeConfig {
  titlePlaceholder: string;
  showDosage: boolean;
  showForm: boolean;
  showConstraint: boolean;
  constraintOptions?: { value: string; label: string }[];
  itemLabel: string;
}

const WINDOW_TYPE_CONFIG: Record<WindowType, WindowTypeConfig> = {
  health: {
    titlePlaceholder: "Morning — Empty Stomach",
    showDosage: true,
    showForm: true,
    showConstraint: true,
    constraintOptions: [
      { value: "none", label: "No constraint" },
      { value: "empty_stomach", label: "Empty stomach" },
      { value: "with_food", label: "With food" },
      { value: "post_workout", label: "Post-workout" },
      { value: "before_bed", label: "Before bed" },
    ],
    itemLabel: "Supplements",
  },
  chores: {
    titlePlaceholder: "Morning Chores",
    showDosage: false,
    showForm: false,
    showConstraint: false,
    itemLabel: "Tasks",
  },
  spiritual: {
    titlePlaceholder: "Morning Prayer / Meditation",
    showDosage: false,
    showForm: false,
    showConstraint: false,
    itemLabel: "Practices",
  },
  general: {
    titlePlaceholder: "Window title",
    showDosage: false,
    showForm: false,
    showConstraint: false,
    itemLabel: "Items",
  },
};

const CONSTRAINT_OPTIONS = WINDOW_TYPE_CONFIG.health.constraintOptions!;

const FORM_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "capsule", label: "Capsule" },
  { value: "softgel", label: "Softgel" },
  { value: "tablet", label: "Tablet" },
  { value: "powder", label: "Powder" },
  { value: "liquid", label: "Liquid" },
  { value: "gummy", label: "Gummy" },
  { value: "patch", label: "Patch" },
  { value: "injection", label: "Injection" },
];

function emptyItem(): WindowItem {
  return { name: "", dosage: "", form: "", notes: "", rampSteps: [] };
}

function emptyWindow(): RoutineWindow {
  return { title: "", targetTime: "", constraint: "none", windowType: "general", items: [emptyItem()] };
}

export function RoutineForm({
  open,
  onOpenChange,
  routine,
  onSaved,
}: RoutineFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Mode: "simple" = no windows (recurring card), "windowed" = has windows (checklist), "sleep" = sleep tracker
  const [mode, setMode] = useState<"simple" | "windowed" | "sleep">("simple");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("daily");
  const [color, setColor] = useState("");
  const [estimatedMins, setEstimatedMins] = useState("");
  const [areaId, setAreaId] = useState("");
  const [routineType, setRoutineType] = useState<"static" | "dynamic">("static");
  const [startDate, setStartDate] = useState("");
  const [totalDays, setTotalDays] = useState("");
  const [windows, setWindows] = useState<RoutineWindow[]>([emptyWindow()]);

  // Simple mode fields
  const [targetTime, setTargetTime] = useState("");
  const [dueByTime, setDueByTime] = useState("");
  const [goalId, setGoalId] = useState("");
  const [progressionEnabled, setProgressionEnabled] = useState(false);
  const [progressionBaseValue, setProgressionBaseValue] = useState("");
  const [progressionIncrement, setProgressionIncrement] = useState("");
  const [progressionUnit, setProgressionUnit] = useState("");
  const [progressionFrequency, setProgressionFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");

  // Sleep tracker fields
  const [targetBedtime, setTargetBedtime] = useState("23:00");
  const [targetWakeTime, setTargetWakeTime] = useState("07:00");

  const [areas, setAreas] = useState<Area[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const isEditing = !!routine;

  useEffect(() => {
    if (open) {
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

  useEffect(() => {
    if (routine) {
      const isSleep = routine.routineType === "sleep";
      const isSimple = routine.windows.length === 0 && !isSleep;
      setMode(isSleep ? "sleep" : isSimple ? "simple" : "windowed");
      setTitle(routine.title);
      setDescription(routine.description || "");
      setCronExpression(routine.cronExpression);
      setColor(routine.color || "");
      setEstimatedMins(routine.estimatedMins ? String(routine.estimatedMins) : "");
      setAreaId(routine.areaId || "");
      setRoutineType((routine.routineType as "static" | "dynamic") || "static");
      setStartDate(routine.startDate ? routine.startDate.slice(0, 10) : "");
      setTotalDays(routine.totalDays ? String(routine.totalDays) : "");

      // Simple fields
      setTargetTime(routine.targetTime || "");
      setDueByTime(routine.dueByTime || "");
      setGoalId(routine.goalId || "");
      const hasProg = routine.progressionBaseValue != null;
      setProgressionEnabled(hasProg);
      setProgressionBaseValue(hasProg ? String(routine.progressionBaseValue) : "");
      setProgressionIncrement(routine.progressionIncrement ? String(routine.progressionIncrement) : "");
      setProgressionUnit(routine.progressionUnit || "");
      setProgressionFrequency((routine.progressionFrequency as "daily" | "weekly" | "monthly") || "weekly");

      // Sleep fields
      setTargetBedtime(routine.targetBedtime || "23:00");
      setTargetWakeTime(routine.targetWakeTime || "07:00");

      if (!isSimple) {
        setWindows(
          routine.windows.map((w) => ({
            title: w.title,
            targetTime: w.targetTime || "",
            constraint: w.constraint || "none",
            windowType: (w.windowType as WindowType) || "health",
            items: w.items.length > 0
              ? w.items.map((item) => ({
                  name: item.name,
                  dosage: item.dosage || "",
                  form: item.form || "",
                  notes: item.notes || "",
                  rampSteps: item.rampSchedule?.steps?.map((s) => ({
                    fromDay: String(s.fromDay),
                    toDay: String(s.toDay),
                    dosage: s.dosage,
                  })) ?? [],
                }))
              : [emptyItem()],
          }))
        );
      } else {
        setWindows([emptyWindow()]);
      }
    } else {
      setMode("simple");
      setTitle("");
      setDescription("");
      setCronExpression("daily");
      setColor("");
      setEstimatedMins("");
      setAreaId("");
      setGoalId("");
      setRoutineType("static");
      setStartDate("");
      setTotalDays("");
      setWindows([emptyWindow()]);
      setTargetTime("");
      setDueByTime("");
      setProgressionEnabled(false);
      setProgressionBaseValue("");
      setProgressionIncrement("");
      setProgressionUnit("");
      setProgressionFrequency("weekly");
      setTargetBedtime("23:00");
      setTargetWakeTime("07:00");
    }
  }, [routine, open]);

  function updateWindow(index: number, updates: Partial<RoutineWindow>) {
    setWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...updates } : w))
    );
  }

  function addWindow() {
    setWindows((prev) => [...prev, emptyWindow()]);
  }

  function removeWindow(index: number) {
    setWindows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(windowIndex: number, itemIndex: number, updates: Partial<WindowItem>) {
    setWindows((prev) =>
      prev.map((w, wi) =>
        wi === windowIndex
          ? {
              ...w,
              items: w.items.map((item, ii) =>
                ii === itemIndex ? { ...item, ...updates } : item
              ),
            }
          : w
      )
    );
  }

  function addItem(windowIndex: number) {
    setWindows((prev) =>
      prev.map((w, wi) =>
        wi === windowIndex ? { ...w, items: [...w.items, emptyItem()] } : w
      )
    );
  }

  function addRampStep(windowIndex: number, itemIndex: number) {
    setWindows((prev) =>
      prev.map((w, wi) =>
        wi === windowIndex
          ? {
              ...w,
              items: w.items.map((item, ii) =>
                ii === itemIndex
                  ? { ...item, rampSteps: [...item.rampSteps, { fromDay: "", toDay: "", dosage: "" }] }
                  : item
              ),
            }
          : w
      )
    );
  }

  function updateRampStep(windowIndex: number, itemIndex: number, stepIndex: number, updates: Partial<RampStep>) {
    setWindows((prev) =>
      prev.map((w, wi) =>
        wi === windowIndex
          ? {
              ...w,
              items: w.items.map((item, ii) =>
                ii === itemIndex
                  ? {
                      ...item,
                      rampSteps: item.rampSteps.map((s, si) =>
                        si === stepIndex ? { ...s, ...updates } : s
                      ),
                    }
                  : item
              ),
            }
          : w
      )
    );
  }

  function removeRampStep(windowIndex: number, itemIndex: number, stepIndex: number) {
    setWindows((prev) =>
      prev.map((w, wi) =>
        wi === windowIndex
          ? {
              ...w,
              items: w.items.map((item, ii) =>
                ii === itemIndex
                  ? { ...item, rampSteps: item.rampSteps.filter((_, si) => si !== stepIndex) }
                  : item
              ),
            }
          : w
      )
    );
  }

  function removeItem(windowIndex: number, itemIndex: number) {
    setWindows((prev) =>
      prev.map((w, wi) =>
        wi === windowIndex
          ? { ...w, items: w.items.filter((_, ii) => ii !== itemIndex) }
          : w
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const parsedMins = parseInt(estimatedMins, 10);
    const validId = (v: string) => (v && v !== "none" ? v : null);
    const parsedTotalDays = parseInt(totalDays, 10);

    if (mode === "sleep") {
      // Sleep tracker routine
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        cronExpression: "daily",
        color: color || "#6366f1",
        estimatedMins: null,
        areaId: validId(areaId),
        routineType: "sleep",
        targetBedtime: targetBedtime || "23:00",
        targetWakeTime: targetWakeTime || "07:00",
        windows: [],
      };

      try {
        const url = isEditing ? `/api/routines/${routine.id}` : "/api/routines";
        const res = await fetch(url, {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save routine");
        }

        toast({
          title: isEditing ? "Sleep tracker updated" : "Sleep tracker created",
          description: isEditing ? "Your sleep tracker has been updated." : "Your sleep tracker has been created. It will appear in your Card File.",
        });
        onSaved();
        onOpenChange(false);
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to save routine",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    } else if (mode === "simple") {
      // Simple routine — no windows
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        cronExpression,
        color: color || null,
        estimatedMins: !isNaN(parsedMins) && parsedMins > 0 ? parsedMins : null,
        areaId: validId(areaId),
        goalId: validId(goalId),
        targetTime: targetTime || null,
        dueByTime: dueByTime || null,
        windows: [],
      };

      if (progressionEnabled && progressionBaseValue && progressionIncrement && progressionUnit) {
        body.progression = {
          baseValue: parseInt(progressionBaseValue, 10),
          increment: parseInt(progressionIncrement, 10),
          unit: progressionUnit,
          frequency: progressionFrequency,
        };
      } else if (isEditing) {
        body.progression = null;
      }

      try {
        const url = isEditing ? `/api/routines/${routine.id}` : "/api/routines";
        const res = await fetch(url, {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save routine");
        }

        toast({
          title: isEditing ? "Routine updated" : "Routine created",
          description: isEditing ? "Your routine has been updated." : "Your routine has been created.",
        });
        onSaved();
        onOpenChange(false);
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to save routine",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    } else {
      // Windowed routine
      const validWindows = windows.filter((w) => w.title.trim());
      if (validWindows.length === 0) {
        toast({
          title: "Validation error",
          description: "Add at least one window with a title.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      const body = {
        title: title.trim(),
        description: description.trim() || null,
        cronExpression,
        color: color || null,
        estimatedMins: !isNaN(parsedMins) && parsedMins > 0 ? parsedMins : null,
        areaId: validId(areaId),
        routineType,
        startDate: routineType === "dynamic" && startDate ? startDate : null,
        totalDays: routineType === "dynamic" && !isNaN(parsedTotalDays) && parsedTotalDays > 0
          ? parsedTotalDays
          : null,
        windows: validWindows.map((w, wi) => ({
          title: w.title.trim(),
          targetTime: w.targetTime || null,
          sortOrder: wi,
          constraint: w.constraint !== "none" ? w.constraint : null,
          windowType: w.windowType,
          items: w.items
            .filter((item) => item.name.trim())
            .map((item, ii) => {
              const validSteps = item.rampSteps.filter(
                (s) => s.fromDay && s.toDay && s.dosage.trim()
              );
              return {
                name: item.name.trim(),
                dosage: item.dosage.trim() || null,
                form: item.form && item.form !== "none" ? item.form : null,
                sortOrder: ii,
                notes: item.notes.trim() || null,
                rampSchedule:
                  routineType === "dynamic" && validSteps.length > 0
                    ? {
                        type: "step" as const,
                        steps: validSteps.map((s) => ({
                          fromDay: parseInt(s.fromDay, 10),
                          toDay: parseInt(s.toDay, 10),
                          dosage: s.dosage.trim(),
                        })),
                      }
                    : null,
              };
            }),
        })),
      };

      try {
        const url = isEditing ? `/api/routines/${routine.id}` : "/api/routines";
        const res = await fetch(url, {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save routine");
        }

        toast({
          title: isEditing ? "Routine updated" : "Routine created",
          description: isEditing ? "Your routine has been updated." : "Your routine has been created.",
        });
        onSaved();
        onOpenChange(false);
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to save routine",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Routine" : "New Routine"}
            </DialogTitle>
            <DialogDescription>
              {mode === "simple"
                ? "A simple recurring card that repeats on a schedule."
                : "A routine with timed windows and checklist items."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Type</Label>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button
                  type="button"
                  variant={mode === "simple" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    if (mode === "windowed" && windows.some((w) => w.title.trim())) {
                      if (!confirm("Switching to simple mode will remove windows. Continue?")) return;
                    }
                    setMode("simple");
                    if (mode === "sleep") setColor("");
                  }}
                >
                  Simple Card
                </Button>
                <Button
                  type="button"
                  variant={mode === "windowed" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setMode("windowed")}
                >
                  Windowed
                </Button>
                <Button
                  type="button"
                  variant={mode === "sleep" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setMode("sleep")}
                >
                  Sleep Tracker
                </Button>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="routine-title">Title</Label>
              <Input
                id="routine-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={mode === "sleep" ? "e.g., Sleep Tracker" : mode === "simple" ? "e.g., Daily meditation" : "e.g., Daily Supplement Stack"}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="routine-description">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="routine-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this routine for?"
                rows={2}
              />
            </div>

            {/* Schedule — hidden for sleep tracker (always daily) */}
            {mode !== "sleep" && (
              <SchedulePicker value={cronExpression} onChange={setCronExpression} />
            )}

            {/* Color, Estimate, Area */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Card Color</Label>
                <div className="flex items-center gap-2">
                  <input
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
                <Label>Time Est. (min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={estimatedMins}
                  onChange={(e) => setEstimatedMins(e.target.value)}
                  placeholder="10"
                />
              </div>
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
            </div>

            {/* ── Simple mode fields ── */}
            {mode === "simple" && (
              <>
                {/* Target & Due Time */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Target Time</Label>
                    <Input
                      type="time"
                      value={targetTime}
                      onChange={(e) => setTargetTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due By Time</Label>
                    <Input
                      type="time"
                      value={dueByTime}
                      onChange={(e) => setDueByTime(e.target.value)}
                    />
                  </div>
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

                {/* Progressive difficulty */}
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="progression-toggle"
                      checked={progressionEnabled}
                      onChange={(e) => setProgressionEnabled(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="progression-toggle" className="text-sm">
                      Progressive difficulty
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Auto-increase target over time
                    </span>
                  </div>
                  {progressionEnabled && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Base Value</Label>
                        <Input
                          type="number"
                          min={1}
                          value={progressionBaseValue}
                          onChange={(e) => setProgressionBaseValue(e.target.value)}
                          placeholder="5"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Increment</Label>
                        <Input
                          type="number"
                          min={1}
                          value={progressionIncrement}
                          onChange={(e) => setProgressionIncrement(e.target.value)}
                          placeholder="1"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input
                          value={progressionUnit}
                          onChange={(e) => setProgressionUnit(e.target.value)}
                          placeholder="min"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Frequency</Label>
                        <Select value={progressionFrequency} onValueChange={(v) => setProgressionFrequency(v as "daily" | "weekly" | "monthly")}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Sleep tracker mode fields ── */}
            {mode === "sleep" && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">
                  Set your target bedtime and wake time. The card will appear daily with buttons to log when you go to bed and when you wake up.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Target Bedtime</Label>
                    <Input
                      type="time"
                      value={targetBedtime}
                      onChange={(e) => setTargetBedtime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Wake Time</Label>
                    <Input
                      type="time"
                      value={targetWakeTime}
                      onChange={(e) => setTargetWakeTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Windowed mode fields ── */}
            {mode === "windowed" && (
              <>
                {/* Routine Type — only show for health windows */}
                {windows.some((w) => w.windowType === "health") && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Label className="text-sm font-medium">Type</Label>
                      <div className="flex items-center gap-1 border rounded-md p-0.5">
                        <Button
                          type="button"
                          variant={routineType === "static" ? "default" : "ghost"}
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => setRoutineType("static")}
                        >
                          Static
                        </Button>
                        <Button
                          type="button"
                          variant={routineType === "dynamic" ? "default" : "ghost"}
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => setRoutineType("dynamic")}
                        >
                          Dynamic
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {routineType === "static"
                          ? "Same dosage every day"
                          : "Dosage changes over time (ramp schedule)"}
                      </span>
                    </div>
                    {routineType === "dynamic" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Start Date</Label>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Total Days</Label>
                          <Input
                            type="number"
                            min={1}
                            value={totalDays}
                            onChange={(e) => setTotalDays(e.target.value)}
                            placeholder="e.g., 18"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Windows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Windows</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addWindow}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Window
                    </Button>
                  </div>

                  {windows.map((window, wi) => {
                    const cfg = WINDOW_TYPE_CONFIG[window.windowType] || WINDOW_TYPE_CONFIG.general;
                    return (
                    <div key={wi} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-muted-foreground shrink-0">
                          #{wi + 1}
                        </span>
                        <Select
                          value={window.windowType}
                          onValueChange={(v) => updateWindow(wi, { windowType: v as WindowType })}
                        >
                          <SelectTrigger className="w-24 h-8 text-xs shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WINDOW_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={window.title}
                          onChange={(e) => updateWindow(wi, { title: e.target.value })}
                          placeholder={cfg.titlePlaceholder}
                          className="flex-1"
                        />
                        {windows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                            onClick={() => removeWindow(wi)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className={`grid ${cfg.showConstraint ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                        <div className="space-y-1">
                          <Label className="text-xs">Target Time</Label>
                          <Input
                            type="time"
                            value={window.targetTime}
                            onChange={(e) => updateWindow(wi, { targetTime: e.target.value })}
                          />
                        </div>
                        {cfg.showConstraint && (
                          <div className="space-y-1">
                            <Label className="text-xs">Constraint</Label>
                            <Select
                              value={window.constraint}
                              onValueChange={(v) => updateWindow(wi, { constraint: v })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONSTRAINT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">{cfg.itemLabel}</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => addItem(wi)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add {cfg.itemLabel.slice(0, -1)}
                          </Button>
                        </div>
                        {window.items.map((item, ii) => (
                          <div key={ii} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={item.name}
                                onChange={(e) =>
                                  updateItem(wi, ii, { name: e.target.value })
                                }
                                placeholder="Name"
                                className="flex-1 h-auto min-h-8 py-1.5 text-xs"
                              />
                              {cfg.showDosage && (
                                <Input
                                  value={item.dosage}
                                  onChange={(e) =>
                                    updateItem(wi, ii, { dosage: e.target.value })
                                  }
                                  placeholder={routineType === "dynamic" ? "Default" : "Dosage"}
                                  className="w-28 h-auto min-h-8 py-1.5 text-xs"
                                />
                              )}
                              {cfg.showForm && (
                                <Select
                                  value={item.form || ""}
                                  onValueChange={(v) => updateItem(wi, ii, { form: v })}
                                >
                                  <SelectTrigger className="w-28 h-auto min-h-8 py-1.5 text-xs">
                                    <SelectValue placeholder="Form" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FORM_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value || "empty"} value={opt.value || "none"}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {window.items.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                                  onClick={() => removeItem(wi, ii)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            {/* Ramp schedule editor (dynamic + health only) */}
                            {routineType === "dynamic" && cfg.showDosage && (
                              <div className="ml-4 space-y-1">
                                {item.rampSteps.map((step, si) => (
                                  <div key={si} className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground w-8">Day</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={step.fromDay}
                                      onChange={(e) => updateRampStep(wi, ii, si, { fromDay: e.target.value })}
                                      placeholder="1"
                                      className="w-14 h-auto min-h-7 py-1 text-[11px]"
                                    />
                                    <span className="text-[10px] text-muted-foreground">to</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={step.toDay}
                                      onChange={(e) => updateRampStep(wi, ii, si, { toDay: e.target.value })}
                                      placeholder="5"
                                      className="w-14 h-auto min-h-7 py-1 text-[11px]"
                                    />
                                    <span className="text-[10px] text-muted-foreground">:</span>
                                    <Input
                                      value={step.dosage}
                                      onChange={(e) => updateRampStep(wi, ii, si, { dosage: e.target.value })}
                                      placeholder="dosage"
                                      className="flex-1 h-auto min-h-7 py-1 text-[11px]"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-destructive"
                                      onClick={() => removeRampStep(wi, ii, si)}
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-[10px] px-1"
                                  onClick={() => addRampStep(wi, ii)}
                                >
                                  <Plus className="h-2.5 w-2.5 mr-0.5" />
                                  Add dosage step
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            )}
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
                  ? "Update Routine"
                  : "Create Routine"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
