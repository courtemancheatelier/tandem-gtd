"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, FileText } from "lucide-react";

interface InboxItem {
  id: string;
  content: string;
  notes: string | null;
  createdAt: string;
}

interface ProcessingStep1Props {
  item: InboxItem;
  onActionable: () => void;
  onNotActionable: () => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
}

export function ProcessingStep1({
  item,
  onActionable,
  onNotActionable,
}: ProcessingStep1Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Review Item
            </CardTitle>
            <Badge variant="outline">{timeAgo(item.createdAt)}</Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <p className="text-base font-medium leading-relaxed">
            {item.content}
          </p>
          {item.notes && (
            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
              {item.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">Is this actionable?</h2>
        <p className="text-sm text-muted-foreground">
          Can you do something about this? Is there a concrete next action?
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button
            size="lg"
            onClick={onActionable}
            className="min-w-[200px]"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Yes, it&apos;s actionable
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onNotActionable}
            className="min-w-[200px]"
          >
            <XCircle className="h-5 w-5 mr-2" />
            No, it&apos;s not
          </Button>
        </div>
      </div>
    </div>
  );
}
