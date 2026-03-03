"use client";

import { useEffect, useState, useCallback } from "react";
import { CardFileView } from "@/components/recurring/CardFileView";
import { useToast } from "@/components/ui/use-toast";
import { useUndo } from "@/contexts/UndoContext";
import { Loader2, RotateCcw } from "lucide-react";
import { HelpLink } from "@/components/shared/HelpLink";

interface CardFileTask {
  id: string;
  title: string;
  notes?: string | null;
  scheduledDate?: string | null;
  estimatedMins?: number | null;
  energyLevel?: string | null;
  version: number;
  context?: { id: string; name: string; color: string | null } | null;
  project?: { id: string; title: string } | null;
  recurringTemplate?: {
    id: string;
    color?: string | null;
    estimatedMins?: number | null;
    scheduleLabel: string;
    skipStreak?: number;
  } | null;
}

export default function CardFilePage() {
  const { toast } = useToast();
  const { push: pushUndo } = useUndo();
  const [overdue, setOverdue] = useState<CardFileTask[]>([]);
  const [today, setToday] = useState<CardFileTask[]>([]);
  const [upcoming, setUpcoming] = useState<CardFileTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/card-file");
      if (res.ok) {
        const data = await res.json();
        setOverdue(data.overdue);
        setToday(data.today);
        setUpcoming(data.upcoming);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleComplete(taskId: string) {
    const task = [...overdue, ...today, ...upcoming].find((t) => t.id === taskId);
    const taskTitle = task?.title ?? "Task";
    const previousStatus = "NOT_STARTED";

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task?.version }),
    });

    if (res.ok) {
      const data = await res.json();
      const cascade = data.cascade;
      const recycledTaskIds = (cascade.recycledTasks ?? []).map((t: { id: string }) => t.id);

      pushUndo({
        description: `Completed "${taskTitle}"`,
        reverseAction: async () => {
          await fetch(`/api/tasks/${taskId}/undo-complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              previousStatus,
              deleteRecycledTasks: recycledTaskIds,
              cascade: {
                demoteTasks: cascade.promotedTasks?.map((t: { id: string }) => t.id) ?? [],
                reopenProjects: cascade.completedProjects?.map((p: { id: string }) => p.id) ?? [],
                revertGoals: cascade.updatedGoals?.map((g: { id: string; previousProgress: number; previousStatus: string }) => ({
                  id: g.id,
                  previousProgress: g.previousProgress,
                  previousStatus: g.previousStatus,
                })) ?? [],
              },
            }),
          });
          await fetchData();
        },
      });

      if (cascade.recycledTasks?.length > 0) {
        const r = cascade.recycledTasks[0];
        const nextDate = new Date(r.nextDue).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        toast({
          title: "Recurring task recycled",
          description: `Scheduled "${r.title}" for ${nextDate}`,
        });
      }

      await fetchData();
    } else {
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive",
      });
    }
  }

  async function handleSkip(taskId: string) {
    const task = [...overdue, ...today, ...upcoming].find((t) => t.id === taskId);

    const res = await fetch(`/api/tasks/${taskId}/skip-recurring`, {
      method: "POST",
    });

    if (res.ok) {
      const data = await res.json();
      if (data.recycledTask) {
        const nextDate = new Date(data.recycledTask.nextDue).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        toast({
          title: "Skipped",
          description: `"${task?.title}" skipped. Next: ${nextDate}`,
        });
      } else {
        toast({ title: "Skipped", description: `"${task?.title}" skipped.` });
      }
      await fetchData();
    } else {
      toast({
        title: "Error",
        description: "Failed to skip task",
        variant: "destructive",
      });
    }
  }

  async function handleDefer(taskId: string, date: string) {
    const task = [...overdue, ...today, ...upcoming].find((t) => t.id === taskId);

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: taskId,
        scheduledDate: date,
        version: task?.version,
      }),
    });

    if (res.ok) {
      const deferDate = new Date(date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      toast({
        title: "Deferred",
        description: `"${task?.title}" deferred to ${deferDate}`,
      });
      await fetchData();
    } else {
      toast({
        title: "Error",
        description: "Failed to defer task",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalCards = overdue.length + today.length + upcoming.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RotateCcw className="h-6 w-6 text-primary" />
          Card File
          <HelpLink slug="card-file-recurring" />
        </h1>
        <p className="text-muted-foreground mt-1">
          {totalCards} recurring card{totalCards !== 1 ? "s" : ""}
        </p>
      </div>

      <CardFileView
        overdue={overdue}
        today={today}
        upcoming={upcoming}
        onComplete={handleComplete}
        onSkip={handleSkip}
        onDefer={handleDefer}
        onLoadPack={fetchData}
      />
    </div>
  );
}
