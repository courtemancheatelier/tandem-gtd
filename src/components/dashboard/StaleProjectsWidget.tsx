"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StaleProject {
  id: string;
  title: string;
  status: string;
  daysSinceActivity: number;
  lastActivityDate: string;
}

export function StaleProjectsWidget({ data }: { data: StaleProject[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stale Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All projects have recent activity
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stale Projects</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px] px-6 pb-6">
          <div className="space-y-2">
            {data.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center gap-3 rounded-md p-2 -mx-2 hover:bg-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {project.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last activity: {project.lastActivityDate}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 ${
                    project.daysSinceActivity > 21
                      ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                      : "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                  }`}
                >
                  {project.daysSinceActivity}d ago
                </Badge>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
