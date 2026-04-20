"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Undo2, GripVertical } from "lucide-react";
import type { ProjectScaffoldSuggestion } from "@/lib/ai/scaffold-types";

interface ProjectScaffoldPreviewProps {
  suggestion: ProjectScaffoldSuggestion;
  onUndo: () => void;
}

const projectTypeLabels: Record<string, string> = {
  SEQUENTIAL: "Sequential",
  PARALLEL: "Parallel",
  SINGLE_ACTIONS: "Single Actions",
};

export function ProjectScaffoldPreview({
  suggestion,
  onUndo,
}: ProjectScaffoldPreviewProps) {
  const sortedTasks = [...suggestion.tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <div className="space-y-3">
      {/* AI reasoning banner */}
      <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-medium">
            Suggested: {projectTypeLabels[suggestion.projectType] ?? suggestion.projectType}
          </span>
          <p className="text-muted-foreground mt-0.5">
            {suggestion.projectTypeReason}
          </p>
        </div>
      </div>

      {/* Task list with dependency indicators */}
      <div className="space-y-1">
        {sortedTasks.map((task) => (
          <div
            key={task.sortOrder}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">{task.title}</span>

            {task.dependsOn && task.dependsOn.length > 0 && (
              <Badge variant="outline" className="text-xs">
                after {task.dependsOn.map((d) => `#${d + 1}`).join(", ")}
              </Badge>
            )}

            {task.estimatedMins && (
              <span className="text-xs text-muted-foreground">
                ~{task.estimatedMins}m
              </span>
            )}

            {task.energyLevel && (
              <Badge variant="secondary" className="text-xs">
                {task.energyLevel.toLowerCase()}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {/* Phases (if present) */}
      {suggestion.phases && suggestion.phases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestion.phases.map((phase) => (
            <Badge key={phase.label} variant="outline">
              {phase.label}: tasks{" "}
              {phase.taskIndices.map((i) => `#${i + 1}`).join(", ")}
            </Badge>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onUndo}>
          <Undo2 className="h-3.5 w-3.5 mr-1" />
          Undo AI Changes
        </Button>
      </div>
    </div>
  );
}
