"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";


interface CompletedTask {
  id: string;
  title: string;
  area: string | null;
}

interface Displacement {
  deferralDate: string;
  completedTasks: CompletedTask[];
}

interface DriftTask {
  id: string;
  title: string;
  deferralCount: number;
}

interface Props {
  tasks: DriftTask[];
}

function DisplacementRow({ task }: { task: DriftTask }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<Displacement[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expanded && !data) {
      setLoading(true);
      fetch(`/api/insights/drift/displacement/${task.id}`)
        .then((r) => r.json())
        .then((d) => setData(d.displacements ?? []))
        .catch(() => setData([]))
        .finally(() => setLoading(false));
    }
  }, [expanded, data, task.id]);

  // Compute most frequent area from displacement data
  const areaCounts = new Map<string, number>();
  if (data) {
    for (const d of data) {
      for (const ct of d.completedTasks) {
        const area = ct.area ?? "No area";
        areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
      }
    }
  }
  const topArea = areaCounts.size > 0
    ? Array.from(areaCounts.entries()).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="text-sm font-medium truncate flex-1">{task.title}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{task.deferralCount} deferrals</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Loading displacement data...</p>}
          {data && data.length === 0 && (
            <p className="text-xs text-muted-foreground">No displacement data available</p>
          )}
          {data && data.map((d) => (
            <div key={d.deferralDate} className="pl-6 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Deferred on {new Date(d.deferralDate + "T00:00:00").toLocaleDateString()}
              </p>
              {d.completedTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No tasks completed that day</p>
              ) : (
                <ul className="space-y-0.5">
                  {d.completedTasks.map((ct) => (
                    <li key={ct.id} className="text-xs flex items-center gap-2">
                      <span className="truncate">{ct.title}</span>
                      {ct.area && (
                        <span className="text-muted-foreground shrink-0">({ct.area})</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {topArea && (
            <div className="pl-6 pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Most displaced by: <span className="font-medium text-foreground">{topArea[0]}</span> ({topArea[1]} task{topArea[1] !== 1 ? "s" : ""})
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DisplacementLens({ tasks }: Props) {
  // Only show tasks with 3+ deferrals
  const eligible = tasks.filter((t) => t.deferralCount >= 3);

  if (eligible.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Displacement Lens</CardTitle>
          <CardDescription>What displaced your deferred tasks?</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No tasks with 3+ deferrals</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Displacement Lens</CardTitle>
        <CardDescription>What displaced your most-deferred tasks?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {eligible.map((task) => (
          <DisplacementRow key={task.id} task={task} />
        ))}
      </CardContent>
    </Card>
  );
}
