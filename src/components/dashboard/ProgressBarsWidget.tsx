"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ProgressChild {
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
  children: ProgressChild[];
}

export function ProgressBarsWidget({
  data,
}: {
  data: ProjectProgressItem[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active projects</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((project) => (
          <div key={project.id}>
            <div className="flex items-center gap-2">
              {project.children.length > 0 ? (
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
                <span className="w-4.5" />
              )}
              <Link
                href={`/projects/${project.id}`}
                className="flex-1 min-w-0 hover:underline"
              >
                <p className="text-sm font-medium truncate">{project.title}</p>
              </Link>
              <span className="text-xs text-muted-foreground shrink-0">
                {project.tasksDone}/{project.tasksTotal}
              </span>
            </div>
            <div className="ml-6 mt-1">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${Math.round(project.rollupProgress * 100)}%`,
                  }}
                />
              </div>
            </div>
            {expanded.has(project.id) && project.children.length > 0 && (
              <div className="ml-6 mt-2 space-y-2 pl-2 border-l">
                {project.children.map((child) => (
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
        ))}
      </CardContent>
    </Card>
  );
}
