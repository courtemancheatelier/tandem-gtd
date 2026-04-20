"use client";

import { useState } from "react";
import { useTimer } from "@/contexts/TimerContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RunawayTimerDialog() {
  const { session, elapsedMin, stop, showRunawayDialog, setShowRunawayDialog } =
    useTimer();
  const [adjustMin, setAdjustMin] = useState("");

  if (!session || !showRunawayDialog) return null;

  function formatElapsed(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0 && m > 0) return `${h} hour${h !== 1 ? "s" : ""} ${m} min`;
    if (h > 0) return `${h} hour${h !== 1 ? "s" : ""}`;
    return `${m} min`;
  }

  async function handleAdjust() {
    const mins = parseInt(adjustMin, 10);
    if (mins >= 0) {
      await stop({ adjustedMinutes: mins });
      setShowRunawayDialog(false);
    }
  }

  async function handleKeep() {
    await stop();
    setShowRunawayDialog(false);
  }

  async function handleDiscard() {
    await stop({ discard: true });
    setShowRunawayDialog(false);
  }

  return (
    <Dialog
      open={showRunawayDialog}
      onOpenChange={(open) => {
        if (!open) setShowRunawayDialog(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Timer still running</DialogTitle>
          <DialogDescription>
            You have a timer running on &ldquo;{session.taskTitle}&rdquo; for{" "}
            {formatElapsed(elapsedMin)}. What happened?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 justify-start text-sm"
              onClick={handleAdjust}
              disabled={!adjustMin || parseInt(adjustMin, 10) < 0}
            >
              I forgot &mdash; adjust to
            </Button>
            <Input
              type="number"
              min={0}
              value={adjustMin}
              onChange={(e) => setAdjustMin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdjust();
              }}
              placeholder="min"
              className="w-20 h-9"
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-sm"
            onClick={handleKeep}
          >
            I was actually working that long
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-sm text-muted-foreground"
            onClick={handleDiscard}
          >
            Discard this session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
