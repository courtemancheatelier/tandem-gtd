"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DeferDatePicker } from "@/components/tasks/DeferDatePicker";
import { Calendar, Clock, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskData {
  id: string;
  title: string;
  notes?: string | null;
  status: string;
  isNextAction: boolean;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  dueDate?: string | null;
  scheduledDate?: string | null;
  version: number;
  project?: { id: string; title: string; type: string } | null;
  context?: { id: string; name: string; color: string | null } | null;
}

interface DateGroup {
  date: string; // YYYY-MM-DD
  tasks: TaskData[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatGroupDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isTomorrow =
    date.toDateString() === tomorrow.toDateString();

  if (isTomorrow) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function relativeDays(dateStr: string): string {
  const target = new Date(dateStr + "T12:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 1) return "1 day";
  if (diff < 7) return `${diff} days`;
  if (diff < 30) {
    const weeks = Math.floor(diff / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  const months = Math.floor(diff / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TicklerListProps {
  /** Initial page size. Defaults to 50. */
  pageSize?: number;
}

export function TicklerList({ pageSize = 50 }: TicklerListProps) {
  const { toast } = useToast();
  const [dueToday, setDueToday] = useState<TaskData[]>([]);
  const [groups, setGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchData = useCallback(
    async (before?: string) => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (before) params.set("before", before);

      const res = await fetch(`/api/tasks/tickler?${params}`);
      if (!res.ok) return;

      const data = await res.json();

      if (before) {
        // Append to existing groups
        setGroups((prev) => {
          const merged = [...prev];
          for (const group of data.deferred as DateGroup[]) {
            const existing = merged.find((g) => g.date === group.date);
            if (existing) {
              // Merge tasks, avoiding duplicates
              const ids = new Set(existing.tasks.map((t) => t.id));
              for (const task of group.tasks) {
                if (!ids.has(task.id)) existing.tasks.push(task);
              }
            } else {
              merged.push(group);
            }
          }
          return merged;
        });
      } else {
        setDueToday(data.dueToday);
        setGroups(data.deferred);
      }

      setHasMore(data.hasMore);
    },
    [pageSize]
  );

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  async function handleLoadMore() {
    if (!groups.length) return;
    setLoadingMore(true);
    const lastGroup = groups[groups.length - 1];
    const lastTask = lastGroup.tasks[lastGroup.tasks.length - 1];
    if (lastTask?.scheduledDate) {
      await fetchData(lastTask.scheduledDate);
    }
    setLoadingMore(false);
  }

  async function handleDateChange(taskId: string, newDate: string | null) {
    // Find the task to get its current version
    const task = groups.flatMap((g) => g.tasks).find((t) => t.id === taskId)
      ?? dueToday.find((t) => t.id === taskId);

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, scheduledDate: newDate, version: task?.version }),
    });

    if (res.status === 409) {
      toast({ title: "Conflict", description: "This task was modified by another user. Refreshing...", variant: "destructive" });
      setLoading(true);
      await fetchData();
      setLoading(false);
      return;
    }

    if (res.ok) {
      toast({
        title: newDate ? "Task deferred" : "Task un-deferred",
        description: newDate
          ? `Deferred until ${new Date(newDate).toLocaleDateString()}`
          : "Task is now available in Do Now",
      });
      // Refresh the list
      setLoading(true);
      await fetchData();
      setLoading(false);
    } else {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalCount =
    dueToday.length +
    groups.reduce((sum, g) => sum + g.tasks.length, 0);

  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No deferred tasks. Use the defer button on any task to schedule it
            for a future date.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Due Today (just became active) */}
      {dueToday.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-semibold text-green-600 dark:text-green-400">
              Activated Today
            </h3>
            <Badge variant="secondary" className="text-xs">
              {dueToday.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {dueToday.map((task) => (
              <TicklerTaskRow
                key={task.id}
                task={task}
                onDateChange={handleDateChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Deferred groups */}
      {groups.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold">
              {formatGroupDate(group.date)}
            </h3>
            <span className="text-xs text-muted-foreground">
              in {relativeDays(group.date)}
            </span>
            <Badge variant="outline" className="text-xs">
              {group.tasks.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {group.tasks.map((task) => (
              <TicklerTaskRow
                key={task.id}
                task={task}
                onDateChange={handleDateChange}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={handleLoadMore}
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row sub-component
// ---------------------------------------------------------------------------

function TicklerTaskRow({
  task,
  onDateChange,
}: {
  task: TaskData;
  onDateChange: (taskId: string, newDate: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{task.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {task.project && (
            <span className="text-xs text-muted-foreground">
              {task.project.title}
            </span>
          )}
          {task.context && (
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0"
              style={
                task.context.color
                  ? { borderColor: task.context.color, color: task.context.color }
                  : undefined
              }
            >
              {task.context.name}
            </Badge>
          )}
          {task.dueDate && (
            <span className="text-xs text-muted-foreground">
              Due {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <DeferDatePicker
        value={task.scheduledDate ?? null}
        onChange={(newDate) => onDateChange(task.id, newDate)}
      />
    </div>
  );
}
