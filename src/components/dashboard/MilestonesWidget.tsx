"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Diamond } from "lucide-react";

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  projectId: string | null;
  projectTitle: string | null;
  status: string;
  daysUntilDue: number;
}

export function MilestonesWidget({ data }: { data: Milestone[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upcoming Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No milestones in the next 30 days
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Upcoming Milestones</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px] px-6 pb-6">
          <div className="space-y-3">
            {data.map((milestone) => (
              <div key={milestone.id} className="flex items-start gap-3">
                <Diamond
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    milestone.daysUntilDue <= 3
                      ? "text-red-500"
                      : milestone.daysUntilDue <= 7
                      ? "text-amber-500"
                      : "text-primary"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{milestone.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-xs ${
                        milestone.daysUntilDue <= 3
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : milestone.daysUntilDue <= 7
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {milestone.daysUntilDue === 0
                        ? "Due today"
                        : milestone.daysUntilDue === 1
                        ? "Due tomorrow"
                        : `${milestone.daysUntilDue}d remaining`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {milestone.dueDate}
                    </span>
                  </div>
                  {milestone.projectTitle && (
                    <Link
                      href={`/projects/${milestone.projectId}`}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      {milestone.projectTitle}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
