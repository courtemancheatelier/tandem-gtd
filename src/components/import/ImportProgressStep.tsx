"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ImportProgressStepProps {
  jobId: string;
  onComplete: () => void;
}

export function ImportProgressStep({
  jobId,
  onComplete,
}: ImportProgressStepProps) {
  const [progress, setProgress] = React.useState(0);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/import/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        setProgress(data.processedItems ?? 0);
        setTotal(data.totalItems ?? 0);

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          onComplete();
          return;
        }

        // Poll every second while processing
        setTimeout(poll, 1000);
      } catch {
        if (!cancelled) setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [jobId, onComplete]);

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Importing...</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {progress} of {total} items
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Please wait while your data is imported. This may take a moment for
          large files.
        </p>
      </CardContent>
    </Card>
  );
}
