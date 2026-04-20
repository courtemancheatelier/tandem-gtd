"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, SkipForward, Ghost, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface OutcomeData {
  completed: number;
  skippedDeferred: number;
  expiredUntouched: number;
  expiredTasks: {
    id: string;
    title: string;
    area: string | null;
    scheduledDate: string | null;
    dueDate: string | null;
  }[];
}

interface Props {
  current: OutcomeData;
  prior: OutcomeData | null;
}

function TrendIndicator({ current, prior }: { current: number; prior: number | null }) {
  if (prior == null || prior === 0) return null;
  const diff = current - prior;
  if (diff === 0) return <span className="text-xs text-muted-foreground ml-1">same</span>;
  return (
    <span className={cn("text-xs ml-1", diff > 0 ? "text-muted-foreground" : "text-muted-foreground")}>
      {diff > 0 ? "+" : ""}{diff} vs prior
    </span>
  );
}

function ExpiredTasksList({ tasks }: { tasks: OutcomeData["expiredTasks"] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-orange-200 dark:border-orange-900">
      <CardContent className="pt-4 pb-4 px-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Ghost className="h-4 w-4 text-orange-500 shrink-0" />
          <span className="text-sm font-medium">
            {tasks.length} commitment{tasks.length !== 1 ? "s" : ""} passed without being touched
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground ml-auto transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
        {open && (
          <div className="mt-3 max-h-64 overflow-y-auto space-y-2 pr-1">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2 text-sm">
                <Ghost className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <Link
                    href={`/do-now?taskId=${t.id}`}
                    className="text-sm font-medium hover:underline text-foreground"
                  >
                    {t.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {t.area && <span>{t.area} · </span>}
                    {t.scheduledDate ?? t.dueDate}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OutcomeSummary({ current, prior }: Props) {
  const total = current.completed + current.skippedDeferred + current.expiredUntouched;

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Completed */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{current.completed}</span>
              <span className="text-sm text-muted-foreground">{pct(current.completed)}%</span>
              <TrendIndicator current={current.completed} prior={prior?.completed ?? null} />
            </div>
          </CardContent>
        </Card>

        {/* Skipped / Deferred */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <SkipForward className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-muted-foreground">Skipped / Deferred</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{current.skippedDeferred}</span>
              <span className="text-sm text-muted-foreground">{pct(current.skippedDeferred)}%</span>
              <TrendIndicator current={current.skippedDeferred} prior={prior?.skippedDeferred ?? null} />
            </div>
          </CardContent>
        </Card>

        {/* Expired Untouched */}
        <Card className={cn(current.expiredUntouched > 0 && "border-orange-300 dark:border-orange-800")}>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Ghost className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium text-muted-foreground">Expired Untouched</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{current.expiredUntouched}</span>
              <span className="text-sm text-muted-foreground">{pct(current.expiredUntouched)}%</span>
              <TrendIndicator current={current.expiredUntouched} prior={prior?.expiredUntouched ?? null} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expired tasks list — collapsible */}
      {current.expiredTasks.length > 0 && (
        <ExpiredTasksList tasks={current.expiredTasks} />
      )}
    </div>
  );
}
