"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, Calendar, Plus, Clock, Pencil, Trash2 } from "lucide-react";
import { RecurringTemplateForm } from "./RecurringTemplateForm";
import { TemplatePackSection } from "./TemplatePackCard";

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
  lastGenerated?: string | null;
  color?: string | null;
  areaId?: string | null;
  goalId?: string | null;
  area?: { id: string; name: string } | null;
  goal?: { id: string; title: string } | null;
  estimatedMins?: number | null;
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
    return `Monthly on the ${ordinal(dayOfMonth)}`;
  }
  return cronExpression;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Not set";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function RecurringTemplateList() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<RecurringTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/recurring-templates");
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleToggleActive(template: RecurringTemplate) {
    try {
      const res = await fetch(`/api/recurring-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update template");
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id ? { ...t, isActive: !t.isActive } : t
        )
      );
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to toggle template",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(template: RecurringTemplate) {
    if (!confirm(`Delete "${template.title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/recurring-templates/${template.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      toast({
        title: "Template deleted",
        description: `"${template.title}" has been removed.`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete template",
        variant: "destructive",
      });
    }
  }

  function handleEdit(template: RecurringTemplate) {
    setEditingTemplate(template);
    setFormOpen(true);
  }

  function handleCreate() {
    setEditingTemplate(null);
    setFormOpen(true);
  }

  const activeCount = templates.filter((t) => t.isActive).length;
  const overdueCount = templates.filter(
    (t) => t.isActive && isOverdue(t.nextDue)
  ).length;

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {activeCount} active template{activeCount !== 1 ? "s" : ""}
            {overdueCount > 0 && (
              <span className="text-destructive ml-2">
                ({overdueCount} overdue)
              </span>
            )}
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center text-muted-foreground">
              Loading templates...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <RefreshCw className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No recurring templates</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Create a template to automatically generate tasks on a
                schedule. Great for weekly reviews, daily habits, and routine
                check-ins.
              </p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Template
              </Button>
              <div className="mt-6">
                <TemplatePackSection onLoaded={fetchTemplates} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template list — compact rows */}
      {!loading && templates.length > 0 && (
        <Card>
          <div className="divide-y">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`px-4 py-3 ${!template.isActive ? "opacity-50" : ""}`}
              >
                {/* Row 1: color dot, title, badges, actions */}
                <div className="flex items-center gap-2">
                  {template.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: template.color }}
                    />
                  )}
                  <span className="font-medium text-sm truncate">
                    {template.title}
                  </span>
                  {!template.isActive && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      Paused
                    </Badge>
                  )}
                  {template.isActive && isOverdue(template.nextDue) && (
                    <Badge variant="destructive" className="text-[10px] shrink-0">
                      Overdue
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEdit(template)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(template)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Switch
                      checked={template.isActive}
                      onCheckedChange={() => handleToggleActive(template)}
                      aria-label={
                        template.isActive
                          ? "Pause template"
                          : "Activate template"
                      }
                    />
                  </div>
                </div>
                {/* Row 2: schedule, next due, last generated */}
                <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-muted-foreground ml-[18px]">
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    {scheduleLabel(template.cronExpression)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Next: {formatDate(template.nextDue)}
                  </span>
                  {template.lastGenerated && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last: {formatDate(template.lastGenerated)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <RecurringTemplateForm
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editingTemplate}
        onSaved={fetchTemplates}
      />
    </div>
  );
}
