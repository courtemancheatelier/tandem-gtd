"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectHealthItem {
  id: string;
  title: string;
  status: "GREEN" | "YELLOW" | "RED";
  rollupProgress: number;
  overdueCount: number;
  blockedCount: number;
  totalTasks: number;
  staleNextActions: number;
}

interface ProjectProgressChild {
  id: string;
  title: string;
  rollupProgress: number;
  tasksDone: number;
  tasksTotal: number;
}

interface ProjectProgressItem {
  id: string;
  title: string;
  rollupProgress: number;
  tasksDone: number;
  tasksTotal: number;
  children: ProjectProgressChild[];
}

export function ProjectHealthWidget({
  data,
  progressData,
}: {
  data: ProjectHealthItem[];
  progressData?: ProjectProgressItem[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"ALL" | "RED" | "YELLOW" | "GREEN">("ALL");
  const [showAll, setShowAll] = useState(false);

  const VISIBLE_LIMIT = 8;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredData = useMemo(() => {
    if (statusFilter === "ALL") return data;
    return data.filter((p) => p.status === statusFilter);
  }, [data, statusFilter]);

  const visibleData = showAll ? filteredData : filteredData.slice(0, VISIBLE_LIMIT);
  const hiddenCount = filteredData.length - visibleData.length;

  // Counts per status for filter badges
  const redCount = data.filter((p) => p.status === "RED").length;
  const yellowCount = data.filter((p) => p.status === "YELLOW").length;
  const greenCount = data.filter((p) => p.status === "GREEN").length;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Project Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active projects</p>
        </CardContent>
      </Card>
    );
  }

  // Build a lookup for progress data (children, done/total)
  const progressMap = new Map<string, ProjectProgressItem>();
  if (progressData) {
    for (const p of progressData) {
      progressMap.set(p.id, p);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Project Health</CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setStatusFilter("ALL"); setShowAll(false); }}
              className={cn(
                "px-2 py-0.5 rounded text-xs transition-colors",
                statusFilter === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              All
            </button>
            {redCount > 0 && (
              <button
                onClick={() => { setStatusFilter("RED"); setShowAll(false); }}
                className={cn(
                  "px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1",
                  statusFilter === "RED" ? "bg-red-500 text-white" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {redCount}
              </button>
            )}
            {yellowCount > 0 && (
              <button
                onClick={() => { setStatusFilter("YELLOW"); setShowAll(false); }}
                className={cn(
                  "px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1",
                  statusFilter === "YELLOW" ? "bg-yellow-500 text-white" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                {yellowCount}
              </button>
            )}
            {greenCount > 0 && (
              <button
                onClick={() => { setStatusFilter("GREEN"); setShowAll(false); }}
                className={cn(
                  "px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1",
                  statusFilter === "GREEN" ? "bg-green-500 text-white" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {greenCount}
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleData.map((project) => {
          const progress = progressMap.get(project.id);
          const children = progress?.children ?? [];
          const hasChildren = children.length > 0;

          return (
            <div key={project.id}>
              <div className="flex items-center gap-2">
                {hasChildren ? (
                  <button
                    onClick={() => toggle(project.id)}
                    className="p-0.5 hover:bg-accent rounded shrink-0"
                  >
                    {expanded.has(project.id) ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                ) : (
                  <span className="w-[22px] shrink-0" />
                )}
                <span
                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    project.status === "GREEN"
                      ? "bg-green-500"
                      : project.status === "YELLOW"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                />
                <Link
                  href={`/projects/${project.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <p className="text-sm font-medium truncate">
                    {project.title}
                  </p>
                </Link>
                {progress && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {progress.tasksDone}/{progress.tasksTotal}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-1" style={{ marginLeft: hasChildren ? "22px" : "22px" }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.round(project.rollupProgress * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {Math.round(project.rollupProgress * 100)}%
                  </span>
                </div>
              </div>

              {/* Issue callouts */}
              {project.status !== "GREEN" && (
                <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">
                  {project.overdueCount > 0 &&
                    `${project.overdueCount} overdue`}
                  {project.overdueCount > 0 && project.blockedCount > 0 &&
                    " · "}
                  {project.blockedCount > 0 &&
                    `${project.blockedCount} blocked`}
                  {(project.overdueCount > 0 || project.blockedCount > 0) &&
                    project.staleNextActions > 0 &&
                    " · "}
                  {project.staleNextActions > 0 &&
                    `${project.staleNextActions} stale`}
                </p>
              )}

              {/* Expandable children */}
              {expanded.has(project.id) && hasChildren && (
                <div className="ml-[22px] mt-2 space-y-2 pl-4 border-l">
                  {children.map((child) => (
                    <div key={child.id}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${child.id}`}
                          className="flex-1 min-w-0 hover:underline"
                        >
                          <p className="text-xs truncate">{child.title}</p>
                        </Link>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {child.tasksDone}/{child.tasksTotal}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        <div className="h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all"
                            style={{
                              width: `${Math.round(child.rollupProgress * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center pt-1"
          >
            Show {hiddenCount} more...
          </button>
        )}
        {showAll && filteredData.length > VISIBLE_LIMIT && (
          <button
            onClick={() => setShowAll(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center pt-1"
          >
            Show less
          </button>
        )}
      </CardContent>
    </Card>
  );
}
