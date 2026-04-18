"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Target } from "lucide-react";

interface HorizonAlignmentData {
  areas: { id: string; name: string; projectCount: number; goalCount: number }[];
  disconnectedProjectCount: number;
  orphanGoals: { id: string; title: string }[];
}

function alignmentDot(projectCount: number, goalCount: number) {
  if (projectCount > 0 && goalCount > 0) return "bg-green-500";
  if (projectCount > 0 || goalCount > 0) return "bg-yellow-500";
  return "bg-red-500";
}

export function HorizonAlignmentWidget({
  data,
}: {
  data: HorizonAlignmentData;
}) {
  const hasIssues =
    data.disconnectedProjectCount > 0 || data.orphanGoals.length > 0;

  if (data.areas.length === 0 && !hasIssues) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Horizon Alignment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No areas of responsibility defined yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Horizon Alignment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Areas */}
        {data.areas.length > 0 && (
          <div className="space-y-2">
            {data.areas.map((area) => (
              <div
                key={area.id}
                className="flex items-center gap-3 rounded-md p-2 -mx-2"
              >
                <div
                  className={`h-2 w-2 rounded-full shrink-0 ${alignmentDot(area.projectCount, area.goalCount)}`}
                />
                <span className="text-sm font-medium truncate flex-1">
                  {area.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {area.projectCount} proj
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {area.goalCount} goal{area.goalCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Disconnected Projects */}
        {data.disconnectedProjectCount > 0 && (
          <Link href="/projects?area=none" className="block">
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-500/30 dark:bg-yellow-500/10 p-3 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 transition-colors cursor-pointer">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                <span className="text-sm text-yellow-800 dark:text-yellow-300">
                  {data.disconnectedProjectCount} active project
                  {data.disconnectedProjectCount !== 1 ? "s" : ""} not linked to
                  any area
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Orphan Goals */}
        {data.orphanGoals.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Goals without active projects
            </h3>
            <div className="space-y-1.5">
              {data.orphanGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{goal.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
