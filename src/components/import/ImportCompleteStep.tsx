"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";

interface ImportCompleteStepProps {
  jobId: string;
}

interface JobResult {
  status: string;
  createdItems: number;
  skippedItems: number;
  errorCount: number;
  errors: Array<{ entity: string; index: number; message: string }> | null;
}

export function ImportCompleteStep({ jobId }: ImportCompleteStepProps) {
  const [result, setResult] = React.useState<JobResult | null>(null);

  React.useEffect(() => {
    fetch(`/api/import/${jobId}`)
      .then((res) => res.json())
      .then(setResult)
      .catch(() => {});
  }, [jobId]);

  if (!result) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading results...
        </CardContent>
      </Card>
    );
  }

  const isSuccess = result.status === "COMPLETED";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {isSuccess ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          )}
          {isSuccess ? "Import Complete" : "Import Failed"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {result.createdItems} created
          </Badge>
          {result.skippedItems > 0 && (
            <Badge variant="outline">
              {result.skippedItems} skipped
            </Badge>
          )}
          {result.errorCount > 0 && (
            <Badge variant="destructive">
              {result.errorCount} error{result.errorCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {result.errors && result.errors.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">Errors:</p>
            {result.errors.slice(0, 10).map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {err.entity}[{err.index}]: {err.message}
              </p>
            ))}
            {result.errors.length > 10 && (
              <p className="text-xs text-muted-foreground">
                ...and {result.errors.length - 10} more
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button asChild>
            <a href="/do-now">Go to Do Now</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/settings/import">Import More</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
