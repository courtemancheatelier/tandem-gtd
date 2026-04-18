"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SkipForward } from "lucide-react";

interface SkipPopoverProps {
  skipStreak: number;
  onSkip: (note?: string) => void;
}

export function SkipPopover({ skipStreak, onSkip }: SkipPopoverProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  function handleSkip() {
    onSkip(note.trim() || undefined);
    setOpen(false);
    setNote("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Skip this occurrence
          </p>
          {skipStreak >= 2 && (
            <p className="text-xs text-amber-600">
              Skipped {skipStreak}x in a row — consider why
            </p>
          )}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSkip();
            }}
            placeholder="Reason (optional)"
            className="w-full text-sm px-2 py-1.5 rounded border bg-background"
            autoFocus
          />
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={handleSkip}
          >
            Skip{note.trim() ? ` — ${note.trim()}` : ""}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
