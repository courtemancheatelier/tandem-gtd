"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, Plus, Pencil, Trash2, Clock, ChevronDown, ChevronRight, BarChart3, Calendar } from "lucide-react";
import { RoutineForm } from "./RoutineForm";
import { TemplatePackSection } from "@/components/recurring/TemplatePackCard";

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
  area?: { id: string; name: string } | null;
  goal?: { id: string; title: string } | null;
  // Simple routine fields
  targetTime?: string | null;
  dueByTime?: string | null;
  skipStreak?: number;
  progressionBaseValue?: number | null;
  progressionIncrement?: number | null;
  progressionUnit?: string | null;
  progressionFrequency?: string | null;
  progressionStartDate?: string | null;
  taskDefaults?: { projectId?: string | null; contextId?: string | null; energyLevel?: string | null; estimatedMins?: number | null } | null;
  nextDue?: string | null;
  lastGenerated?: string | null;
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
    }[];
  }[];
  createdAt: string;
}

function scheduleLabel(cronExpression: string): string {
  if (cronExpression === "daily") return "Every day";
  if (cronExpression === "weekdays") return "Weekdays";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (cronExpression.startsWith("weekly:")) {
    const day = parseInt(cronExpression.split(":")[1], 10);
    return `Every ${dayNames[day]}`;
  }
  if (cronExpression.startsWith("biweekly:")) {
    const day = parseInt(cronExpression.split(":")[1], 10);
    return `Every other ${dayNames[day]}`;
  }
  if (cronExpression.startsWith("monthly:")) {
    const dayOfMonth = parseInt(cronExpression.split(":")[1], 10);
    const s = ["th", "st", "nd", "rd"];
    const v = dayOfMonth % 100;
    return `Monthly on the ${dayOfMonth}${s[(v - 20) % 10] || s[v] || s[0]}`;
  }
  return cronExpression;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Not set";
  // Append T12:00:00 so local timezone conversion never crosses a date boundary
  return new Date(dateStr.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function RoutineList() {
  const { toast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchRoutines = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/routines");
      if (!res.ok) throw new Error("Failed to load routines");
      const data = await res.json();
      setRoutines(data);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load routines",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  async function handleToggleActive(routine: Routine) {
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !routine.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update routine");
      setRoutines((prev) =>
        prev.map((p) =>
          p.id === routine.id ? { ...p, isActive: !p.isActive } : p
        )
      );
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to toggle routine",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(routine: Routine) {
    if (!confirm(`Delete "${routine.title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete routine");
      setRoutines((prev) => prev.filter((p) => p.id !== routine.id));
      toast({
        title: "Routine deleted",
        description: `"${routine.title}" has been removed.`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete routine",
        variant: "destructive",
      });
    }
  }

  function handleEdit(routine: Routine) {
    setEditingRoutine(routine);
    setFormOpen(true);
  }

  function handleCreate() {
    setEditingRoutine(null);
    setFormOpen(true);
  }

  const activeCount = routines.filter((p) => p.isActive).length;
  const simpleRoutines = routines.filter((r) => r.windows.length === 0);
  const windowedRoutines = routines.filter((r) => r.windows.length > 0);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active routine{activeCount !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Routine
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center text-muted-foreground">
              Loading routines...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && routines.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <RefreshCw className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No routines</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Create a routine to automatically generate tasks on a schedule.
                Simple routines repeat a single card. Windowed routines include
                timed checklists.
              </p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Routine
              </Button>
              <div className="mt-6">
                <TemplatePackSection onLoaded={fetchRoutines} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simple routines (formerly recurring templates) */}
      {!loading && simpleRoutines.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Simple Cards</h3>
          <Card>
            <div className="divide-y">
              {simpleRoutines.map((routine) => (
                <div
                  key={routine.id}
                  className={`px-4 py-3 ${!routine.isActive ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {routine.color && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: routine.color }}
                      />
                    )}
                    <span className="font-medium text-sm truncate">
                      {routine.title}
                    </span>
                    {routine.progressionBaseValue != null && routine.progressionUnit && (
                      <Badge variant="secondary" className="text-[10px] shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {routine.progressionBaseValue}{routine.progressionUnit}
                      </Badge>
                    )}
                    {(routine.skipStreak ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0 border-amber-400 text-amber-600">
                        {routine.skipStreak} skip{routine.skipStreak !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {!routine.isActive && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        Paused
                      </Badge>
                    )}
                    {routine.isActive && isOverdue(routine.nextDue) && (
                      <Badge variant="destructive" className="text-[10px] shrink-0">
                        Overdue
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(routine)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(routine)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Switch
                        checked={routine.isActive}
                        onCheckedChange={() => handleToggleActive(routine)}
                        aria-label={routine.isActive ? "Pause routine" : "Activate routine"}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-muted-foreground ml-[18px]">
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      {scheduleLabel(routine.cronExpression)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Next: {formatDate(routine.nextDue)}
                    </span>
                    {routine.estimatedMins && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {routine.estimatedMins}m
                      </span>
                    )}
                    {routine.area && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {routine.area.name}
                      </Badge>
                    )}
                    {routine.goal && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {routine.goal.title}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Windowed routines */}
      {!loading && windowedRoutines.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Windowed Routines</h3>
          <Card>
            <div className="divide-y">
              {windowedRoutines.map((routine) => {
                const isExpanded = expandedId === routine.id;
                const totalItems = routine.windows.reduce((sum, w) => sum + w.items.length, 0);

                return (
                  <div
                    key={routine.id}
                    className={`px-4 py-3 ${!routine.isActive ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      {routine.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: routine.color }}
                        />
                      )}
                      <button
                        type="button"
                        className="flex items-center gap-1 text-left"
                        onClick={() => setExpandedId(isExpanded ? null : routine.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">{routine.title}</span>
                      </button>
                      {routine.routineType === "dynamic" && (
                        <Badge variant="outline" className="text-[10px] shrink-0 border-blue-400 text-blue-600">
                          {routine.totalDays ? `${routine.totalDays}-day` : "dynamic"}
                        </Badge>
                      )}
                      {!routine.isActive && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Paused
                        </Badge>
                      )}
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Compliance"
                          onClick={() => window.location.href = `/settings/routines/${routine.id}/compliance`}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(routine)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(routine)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Switch
                          checked={routine.isActive}
                          onCheckedChange={() => handleToggleActive(routine)}
                          aria-label={routine.isActive ? "Pause routine" : "Activate routine"}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-muted-foreground ml-[18px]">
                      <span>{scheduleLabel(routine.cronExpression)}</span>
                      <span>
                        {routine.windows.length} window{routine.windows.length !== 1 ? "s" : ""}
                        {" / "}
                        {totalItems} item{totalItems !== 1 ? "s" : ""}
                      </span>
                      {routine.estimatedMins && (
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {routine.estimatedMins}m
                        </span>
                      )}
                      {routine.area && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {routine.area.name}
                        </Badge>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="mt-3 ml-[18px] space-y-2">
                        {routine.windows.map((window) => (
                          <div key={window.id} className="rounded border px-3 py-2">
                            <div className="text-sm font-medium">
                              {window.targetTime && (
                                <span className="text-muted-foreground mr-1.5">
                                  {window.targetTime}
                                </span>
                              )}
                              {window.title}
                              {window.constraint && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 ml-2">
                                  {window.constraint.replace(/_/g, " ")}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {window.items.map((item) => (
                                <div key={item.id} className="text-xs text-muted-foreground">
                                  {item.name}
                                  {item.dosage && ` — ${item.dosage}`}
                                  {item.form && (
                                    <span className="text-muted-foreground/60 ml-1">
                                      ({item.form})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <RoutineForm
        open={formOpen}
        onOpenChange={setFormOpen}
        routine={editingRoutine}
        onSaved={fetchRoutines}
      />
    </div>
  );
}
