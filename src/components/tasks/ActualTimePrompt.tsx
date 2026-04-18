"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActualTimePromptProps {
  taskId: string;
  estimatedMins: number;
  onSubmit: (taskId: string, actualMinutes: number) => void;
  onDismiss: () => void;
  prefillMinutes?: number;
  timerSource?: boolean;
}

function formatMins(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

export function ActualTimePrompt({
  taskId,
  estimatedMins,
  onSubmit,
  onDismiss,
  prefillMinutes,
  timerSource,
}: ActualTimePromptProps) {
  const [custom, setCustom] = useState(
    prefillMinutes !== undefined ? prefillMinutes.toString() : ""
  );
  const [showCustom, setShowCustom] = useState(!!timerSource);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 15_000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleSubmit = useCallback(
    (mins: number) => {
      if (mins > 0) onSubmit(taskId, mins);
    },
    [taskId, onSubmit]
  );

  const handleCustomSubmit = useCallback(() => {
    const mins = parseInt(custom, 10);
    if (mins > 0) {
      handleSubmit(mins);
    }
  }, [custom, handleSubmit]);

  // Generate chip values relative to estimate
  const chipMultipliers = [0.5, 1, 1.5, 2, 2.5, 3];
  const chips = chipMultipliers.map((mult) => {
    const mins = Math.round(estimatedMins * mult);
    return {
      label: mult >= 3 ? `${formatMins(mins)}+` : formatMins(mins),
      value: mins,
      isEstimate: mult === 1,
    };
  });

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {timerSource && prefillMinutes !== undefined ? (
            <span>
              Timer recorded {formatMins(prefillMinutes)} &mdash; adjust if
              needed
            </span>
          ) : (
            <>
              <span>How long did this actually take?</span>
              <span className="text-xs">
                (est. {formatMins(estimatedMins)})
              </span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onDismiss}
          title="Skip"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!timerSource &&
          chips.map((chip) => (
            <Button
              key={chip.value}
              variant="outline"
              size="sm"
              className={cn(
                "h-7 text-xs px-2.5",
                chip.isEstimate && "border-primary/50 font-medium"
              )}
              onClick={() => handleSubmit(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        {showCustom ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                // Keep digits out of document-level shortcut listeners
                // (e.g. Do Now filter shortcuts) while this input has focus.
                e.stopPropagation();
                if (e.key === "Enter") handleCustomSubmit();
                if (e.key === "Escape") {
                  setShowCustom(false);
                  setCustom("");
                }
              }}
              placeholder="min"
              className="h-7 w-16 text-xs"
              autoFocus
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={handleCustomSubmit}
              disabled={!custom || parseInt(custom, 10) <= 0}
            >
              OK
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2.5 text-muted-foreground"
            onClick={() => setShowCustom(true)}
          >
            Other...
          </Button>
        )}
      </div>
    </div>
  );
}
