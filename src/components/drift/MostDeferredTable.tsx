"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";

interface DriftTask {
  id: string;
  title: string;
  status: string;
  area: string | null;
  project: string | null;
  routine: string | null;
  deferralCount: number;
  dueDatePushCount: number;
  totalDriftDays: number;
  breakdownSignal: boolean;
}

interface Props {
  tasks: DriftTask[];
  onSelectTask?: (taskId: string) => void;
}

type SortField = "deferralCount" | "dueDatePushCount" | "totalDriftDays";

export function MostDeferredTable({ tasks, onSelectTask }: Props) {
  const [sortField, setSortField] = useState<SortField>("deferralCount");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...tasks].sort((a, b) => {
    const diff = (a[sortField] ?? 0) - (b[sortField] ?? 0);
    return sortAsc ? diff : -diff;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Most Deferred</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No deferred tasks</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Most Deferred</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-3 font-medium text-muted-foreground">Task</th>
                <th className="pb-2 pr-3 font-medium text-muted-foreground hidden md:table-cell">Area</th>
                <th className="pb-2 pr-3 font-medium text-muted-foreground hidden lg:table-cell">Source</th>
                <th
                  className="pb-2 pr-3 font-medium text-muted-foreground cursor-pointer whitespace-nowrap"
                  onClick={() => toggleSort("deferralCount")}
                >
                  Deferrals <SortIcon field="deferralCount" />
                </th>
                <th
                  className="pb-2 pr-3 font-medium text-muted-foreground cursor-pointer whitespace-nowrap hidden sm:table-cell"
                  onClick={() => toggleSort("dueDatePushCount")}
                >
                  Pushes <SortIcon field="dueDatePushCount" />
                </th>
                <th
                  className="pb-2 pr-3 font-medium text-muted-foreground cursor-pointer whitespace-nowrap hidden sm:table-cell"
                  onClick={() => toggleSort("totalDriftDays")}
                >
                  Drift Days <SortIcon field="totalDriftDays" />
                </th>
                <th className="pb-2 pr-3 font-medium text-muted-foreground hidden md:table-cell">Status</th>
                <th className="pb-2 font-medium text-muted-foreground">Signal</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((task) => (
                <tr
                  key={task.id}
                  className={cn(
                    "border-b last:border-0 hover:bg-muted/50 transition-colors",
                    onSelectTask && "cursor-pointer"
                  )}
                  onClick={() => onSelectTask?.(task.id)}
                >
                  <td className="py-2 pr-3 max-w-[200px] truncate">
                    <Link
                      href={`/do-now?taskId=${task.id}`}
                      className="hover:underline text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground hidden md:table-cell">{task.area ?? "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground hidden lg:table-cell">{task.project ?? task.routine ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums">{task.deferralCount}</td>
                  <td className="py-2 pr-3 tabular-nums hidden sm:table-cell">{task.dueDatePushCount}</td>
                  <td className="py-2 pr-3 tabular-nums hidden sm:table-cell">{task.totalDriftDays}</td>
                  <td className="py-2 pr-3 hidden md:table-cell">
                    <Badge variant="outline" className="text-xs">{task.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="py-2">
                    {task.breakdownSignal && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        Break down
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
