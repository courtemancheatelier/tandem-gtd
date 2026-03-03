"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BlockedTask {
  id: string;
  title: string;
  projectId: string | null;
  projectTitle: string | null;
  blockedBy: { id: string; title: string; status: string }[];
}

export function BlockedQueueWidget({ data }: { data: BlockedTask[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Blocked Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No blocked tasks</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Blocked Tasks</CardTitle>
        <CardDescription>{data.length} task{data.length !== 1 ? "s" : ""} blocked</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px] px-6 pb-6">
          <div className="space-y-3">
            {data.map((task) => (
              <div
                key={task.id}
                className="rounded-md border p-3 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <p className="text-sm font-medium flex-1">{task.title}</p>
                  {task.projectTitle && (
                    <Link href={`/projects/${task.projectId}`}>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {task.projectTitle}
                      </Badge>
                    </Link>
                  )}
                </div>
                <div className="space-y-1">
                  {task.blockedBy.map((blocker) => (
                    <p
                      key={blocker.id}
                      className="text-xs text-muted-foreground flex items-center gap-1.5"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      Waiting on: {blocker.title}
                      <span className="text-xs opacity-70">
                        ({blocker.status.replace("_", " ").toLowerCase()})
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
