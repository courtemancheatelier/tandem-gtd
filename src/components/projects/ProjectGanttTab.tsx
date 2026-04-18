"use client";

import { BarChart3 } from "lucide-react";

export function ProjectGanttTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">Gantt view coming soon</p>
      <p className="text-xs mt-1">Timeline visualization for tasks and sub-projects</p>
    </div>
  );
}
