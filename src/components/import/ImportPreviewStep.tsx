"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ImportPreview } from "@/lib/import/types";

interface ImportPreviewStepProps {
  jobId: string;
  preview: ImportPreview;
  onConfirmed: () => void;
  onCancelled: () => void;
}

export function ImportPreviewStep({
  jobId,
  preview,
  onConfirmed,
  onCancelled,
}: ImportPreviewStepProps) {
  const [confirming, setConfirming] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [localPreview, setLocalPreview] = React.useState(preview);

  const counts = [
    { label: "Tasks", count: localPreview.tasks.length },
    { label: "Projects", count: localPreview.projects.length },
    { label: "Contexts", count: localPreview.contexts.length },
    { label: "Areas", count: localPreview.areas.length },
    { label: "Goals", count: localPreview.goals.length },
    { label: "Inbox Items", count: localPreview.inboxItems.length },
    { label: "Horizon Notes", count: localPreview.horizonNotes.length },
    { label: "Wiki Articles", count: localPreview.wikiArticles.length },
    { label: "Waiting For", count: localPreview.waitingFor.length },
    { label: "Routines", count: localPreview.recurringTemplates.length },
    { label: "Weekly Reviews", count: localPreview.weeklyReviews.length },
  ].filter((c) => c.count > 0);

  const duplicateTasks = localPreview.tasks.filter((t) => t.isDuplicate);
  const duplicateProjects = localPreview.projects.filter((p) => p.isDuplicate);
  const totalDuplicates = duplicateTasks.length + duplicateProjects.length;

  const toggleTaskDuplicateAction = (index: number) => {
    setLocalPreview((prev) => {
      const tasks = [...prev.tasks];
      const task = { ...tasks[index] };
      task.duplicateAction = task.duplicateAction === "skip" ? "overwrite" : "skip";
      tasks[index] = task;
      return { ...prev, tasks };
    });
  };

  const toggleProjectDuplicateAction = (index: number) => {
    setLocalPreview((prev) => {
      const projects = [...prev.projects];
      const project = { ...projects[index] };
      project.duplicateAction = project.duplicateAction === "skip" ? "overwrite" : "skip";
      projects[index] = project;
      return { ...prev, projects };
    });
  };

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);

      const res = await fetch(`/api/import/${jobId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: localPreview }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Confirm failed");
      }

      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await fetch(`/api/import/${jobId}/cancel`, { method: "POST" });
      onCancelled();
    } catch {
      // Even if cancel fails, navigate away
      onCancelled();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Import Preview</CardTitle>
        <CardDescription>Review what will be imported.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary counts */}
        <div className="flex flex-wrap gap-2">
          {counts.map((c) => (
            <Badge key={c.label} variant="secondary">
              {c.count} {c.label}
            </Badge>
          ))}
        </div>

        {/* Duplicates */}
        {totalDuplicates > 0 && (
          <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {totalDuplicates} potential duplicate{totalDuplicates > 1 ? "s" : ""} found
            </p>

            {duplicateTasks.map((task) => {
              const originalIndex = localPreview.tasks.indexOf(task);
              return (
                <div
                  key={originalIndex}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    &ldquo;{task.title}&rdquo;
                    {task.projectTitle && (
                      <span className="text-muted-foreground">
                        {" "}in {task.projectTitle}
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant={task.duplicateAction === "skip" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleTaskDuplicateAction(originalIndex)}
                    >
                      Skip
                    </Button>
                    <Button
                      variant={task.duplicateAction === "overwrite" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleTaskDuplicateAction(originalIndex)}
                    >
                      Import
                    </Button>
                  </div>
                </div>
              );
            })}

            {duplicateProjects.map((project) => {
              const originalIndex = localPreview.projects.indexOf(project);
              return (
                <div
                  key={`p-${originalIndex}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    Project: &ldquo;{project.title}&rdquo;
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant={project.duplicateAction === "skip" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleProjectDuplicateAction(originalIndex)}
                    >
                      Skip
                    </Button>
                    <Button
                      variant={project.duplicateAction === "overwrite" ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleProjectDuplicateAction(originalIndex)}
                    >
                      Import
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Task preview table */}
        {localPreview.tasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Tasks</p>
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Project</th>
                    <th className="px-3 py-2 text-left font-medium">Context</th>
                    <th className="px-3 py-2 text-left font-medium">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {localPreview.tasks.slice(0, 50).map((task, i) => (
                    <tr
                      key={i}
                      className={`border-t ${task.isDuplicate ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-1.5">
                        {task.title}
                        {task.isDuplicate && task.duplicateAction === "skip" && (
                          <Badge variant="outline" className="ml-1 text-xs">
                            dup
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {task.projectTitle || "\u2014"}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {task.contextName || "\u2014"}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {localPreview.tasks.length > 50 && (
                <p className="p-2 text-xs text-center text-muted-foreground">
                  ...and {localPreview.tasks.length - 50} more
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={confirming || cancelling}
          >
            {cancelling ? "Cancelling..." : "Cancel"}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming || cancelling}
          >
            {confirming ? "Importing..." : "Confirm Import"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
