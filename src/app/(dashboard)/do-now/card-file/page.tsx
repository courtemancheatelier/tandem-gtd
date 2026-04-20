"use client";

import { useEffect, useState, useCallback } from "react";
import { CardFileView, type CardFileTask } from "@/components/recurring/CardFileView";
import { useToast } from "@/components/ui/use-toast";
import { useUndo } from "@/contexts/UndoContext";
import { Loader2, RotateCcw, RefreshCw } from "lucide-react";
import { HelpLink } from "@/components/shared/HelpLink";
import { Button } from "@/components/ui/button";

export default function CardFilePage() {
  const { toast } = useToast();
  const { push: pushUndo } = useUndo();
  const [overdue, setOverdue] = useState<CardFileTask[]>([]);
  const [today, setToday] = useState<CardFileTask[]>([]);
  const [upcoming, setUpcoming] = useState<CardFileTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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

  async function handleComplete(taskId: string, note?: string) {
    const task = [...overdue, ...today, ...upcoming].find((t) => t.id === taskId);
    const taskTitle = task?.title ?? "Task";
    const previousStatus = "NOT_STARTED";

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task?.version, note }),
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
        const nextDate = new Date(String(r.nextDue).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, {
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

  async function handleSkip(taskId: string, note?: string) {
    const task = [...overdue, ...today, ...upcoming].find((t) => t.id === taskId);

    const res = await fetch(`/api/tasks/${taskId}/skip-recurring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.recycledTask) {
        const nextDate = new Date(String(data.recycledTask.nextDue).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, {
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

  async function handleCheckWindow(
    routineId: string,
    windowId: string,
    date: string,
    status: "completed" | "skipped"
  ) {
    const res = await fetch(`/api/routines/${routineId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowId, date, status }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.allWindowsComplete) {
        toast({ title: "Routine complete", description: "All windows checked off for today." });
      }
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to update window", variant: "destructive" });
    }
  }

  async function handleToggleItem(
    routineId: string,
    windowId: string,
    date: string,
    itemId: string,
    taken: boolean
  ) {
    const res = await fetch(`/api/routines/${routineId}/log`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowId, date, itemId, taken }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.allWindowsComplete) {
        toast({ title: "Routine complete", description: "All windows checked off for today." });
      }
      await fetchData();
    } else {
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
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

  async function handleMoveToToday(taskId: string) {
    const task = upcoming.find((t) => t.id === taskId);
    const todayStr = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";

    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: taskId,
        scheduledDate: todayStr,
        version: task?.version,
      }),
    });

    if (res.ok) {
      toast({
        title: "Moved to today",
        description: `"${task?.title}" added to today's cards.`,
      });
      await fetchData();
    } else {
      toast({
        title: "Error",
        description: "Failed to move task",
        variant: "destructive",
      });
    }
  }

  async function handleLogSleep(routineId: string, date: string, action: "bed" | "wake") {
    const res = await fetch(`/api/routines/${routineId}/sleep-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, action }),
    });

    if (res.ok) {
      const data = await res.json();
      if (action === "bed") {
        toast({
          title: "Good night!",
          description: `Bedtime logged at ${new Date(data.sleepLog.bedtime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
        });
      } else {
        const dur = data.sleepLog.durationMins;
        const hours = Math.floor(dur / 60);
        const mins = dur % 60;
        toast({
          title: "Good morning!",
          description: `Slept ${hours}h ${mins}m`,
        });
      }
      await fetchData();
    } else {
      const err = await res.json().catch(() => null);
      toast({
        title: "Error",
        description: err?.error || "Failed to log sleep",
        variant: "destructive",
      });
    }
  }

  async function handleEditSleep(routineId: string, date: string, bedtime: string, wakeTime: string) {
    const res = await fetch(`/api/routines/${routineId}/sleep-log`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, bedtime, wakeTime }),
    });

    if (res.ok) {
      const data = await res.json();
      const dur = data.sleepLog.durationMins;
      if (dur != null) {
        const hours = Math.floor(dur / 60);
        const mins = dur % 60;
        toast({
          title: "Sleep log updated",
          description: `Recorded ${hours}h ${mins}m of sleep`,
        });
      } else {
        toast({ title: "Sleep log updated" });
      }
      await fetchData();
    } else {
      const err = await res.json().catch(() => null);
      toast({
        title: "Error",
        description: err?.error || "Failed to update sleep log",
        variant: "destructive",
      });
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/routines/generate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.generated > 0) {
          toast({
            title: "Cards loaded",
            description: `Generated ${data.generated} card${data.generated !== 1 ? "s" : ""} for today.`,
          });
        } else {
          toast({
            title: "All caught up",
            description: "No new cards to generate — everything is already loaded.",
          });
        }
        await fetchData();
      } else {
        toast({
          title: "Error",
          description: "Failed to generate cards",
          variant: "destructive",
        });
      }
    } finally {
      setGenerating(false);
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
      <div className="flex items-start justify-between">
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
        <Button
          onClick={handleGenerate}
          disabled={generating}
          variant="outline"
          size="sm"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Load Today&apos;s Cards
        </Button>
      </div>

      <CardFileView
        overdue={overdue}
        today={today}
        upcoming={upcoming}
        onComplete={handleComplete}
        onSkip={handleSkip}
        onDefer={handleDefer}
        onMoveToToday={handleMoveToToday}
        onCheckWindow={handleCheckWindow}
        onToggleItem={handleToggleItem}
        onLogSleep={handleLogSleep}
        onEditSleep={handleEditSleep}
      />
    </div>
  );
}
