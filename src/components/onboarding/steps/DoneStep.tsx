"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Inbox, Zap, CalendarCheck, PartyPopper, Trash2, Loader2 } from "lucide-react";

interface DoneStepProps {
  brainDumpCount: number;
  contextCount: number;
  areaCount: number;
  sampleDataLoaded?: boolean;
  onRemoveSampleData?: () => Promise<void>;
  onComplete: () => void;
}

export function DoneStep({
  brainDumpCount,
  contextCount,
  areaCount,
  sampleDataLoaded,
  onRemoveSampleData,
  onComplete,
}: DoneStepProps) {
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  return (
    <Card>
      <CardContent className="py-8 md:py-12 px-6 md:px-10 text-center">
        <PartyPopper className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-4">You&apos;re all set!</h2>

        <div className="text-muted-foreground mb-8 space-y-1">
          {brainDumpCount > 0 && (
            <p>
              {brainDumpCount} item{brainDumpCount !== 1 ? "s" : ""} in your
              Inbox to process
            </p>
          )}
          <p>1 task ready to do</p>
          <p>
            {contextCount} context{contextCount !== 1 ? "s" : ""} set up
          </p>
          <p>
            {areaCount} area{areaCount !== 1 ? "s" : ""} of responsibility
          </p>
        </div>

        <div className="space-y-3 mb-8 text-left max-w-sm mx-auto">
          <p className="font-medium text-center mb-2">What&apos;s next?</p>
          <Link
            href="/inbox"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Inbox className="h-4 w-4" />
            Process your Inbox — clarify the rest of your brain dump
          </Link>
          <Link
            href="/do-now"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Zap className="h-4 w-4" />
            Do Now — see your available actions
          </Link>
          <Link
            href="/review"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <CalendarCheck className="h-4 w-4" />
            Weekly Review — do this every week to stay on track
          </Link>
        </div>

        {sampleDataLoaded && onRemoveSampleData && !removed && (
          <div className="mb-4 p-3 rounded-lg border border-dashed text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Sample data is still loaded. Remove it to start fresh, or keep it to explore.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setRemoving(true);
                await onRemoveSampleData();
                setRemoving(false);
                setRemoved(true);
              }}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Remove sample data
            </Button>
          </div>
        )}
        {removed && (
          <p className="text-sm text-muted-foreground mb-4">
            Sample data removed. You&apos;re starting fresh!
          </p>
        )}

        <Button onClick={onComplete} size="lg">
          Go to Do Now
        </Button>
      </CardContent>
    </Card>
  );
}
