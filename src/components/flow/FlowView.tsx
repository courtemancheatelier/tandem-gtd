"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { FlowSummaryHeader } from "./FlowSummaryHeader";
import { ProjectBurnDown } from "@/components/projects/ProjectBurnDown";
import { FlowZoneActionable } from "./FlowZoneActionable";
import { FlowZoneBlocked } from "./FlowZoneBlocked";
import { FlowZoneCompleted } from "./FlowZoneCompleted";
import { FlowTeamBreakdown } from "./FlowTeamBreakdown";
import type { FlowApiResponse } from "@/lib/flow/types";

interface FlowViewProps {
  projectId: string;
  highlightTaskId?: string | null;
}

export function FlowView({ projectId, highlightTaskId }: FlowViewProps) {
  const { toast } = useToast();
  const [data, setData] = useState<FlowApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrolledRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/flow`);
      if (!res.ok) {
        setError("Failed to load flow data");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load flow data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-scroll to highlighted task after data loads
  useEffect(() => {
    if (!highlightTaskId || !data || scrolledRef.current) return;
    scrolledRef.current = true;

    // Small delay to let the DOM render
    setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${highlightTaskId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }, [highlightTaskId, data]);

  async function handleComplete(taskId: string) {
    const task = [
      ...(data?.zones.actionable ?? []),
      ...(data?.zones.blocked ?? []),
    ].find((t) => t.id === taskId);

    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (res.status === 409) {
      toast({
        title: "Conflict",
        description: "This task was modified by another user. Refreshing...",
        variant: "destructive",
      });
      await fetchData();
      return;
    }

    if (res.ok) {
      toast({
        title: "Task completed",
        description: task?.title ?? "Task",
      });
      await fetchData();
    } else {
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive",
      });
    }
  }

  async function handleStatusChange(taskId: string, status: string) {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status }),
    });

    if (res.ok) {
      await fetchData();
    } else {
      toast({
        title: "Error",
        description: "Failed to update task status",
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

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-2">
        <p className="text-muted-foreground">{error || "No data"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <FlowSummaryHeader summary={data.summary} />

      {/* Charts — burn-down, burn-up, velocity with tasks/hours toggle */}
      <ProjectBurnDown projectId={projectId} projectTitle={data.project.title} velocityUnit={data.project.velocityUnit} />

      {/* Team breakdown */}
      {data.teamBreakdown && data.teamBreakdown.length > 0 && (
        <FlowTeamBreakdown members={data.teamBreakdown} />
      )}

      {/* Zones — single column */}
      <FlowZoneActionable
        tasks={data.zones.actionable}
        onComplete={handleComplete}
        onStatusChange={handleStatusChange}
        highlightTaskId={highlightTaskId}
      />

      <FlowZoneBlocked
        tasks={data.zones.blocked}
        onComplete={handleComplete}
        onStatusChange={handleStatusChange}
        highlightTaskId={highlightTaskId}
      />

      <FlowZoneCompleted
        tasks={data.zones.completed}
        highlightTaskId={highlightTaskId}
      />
    </div>
  );
}
