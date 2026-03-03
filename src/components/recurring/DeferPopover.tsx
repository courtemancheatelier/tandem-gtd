"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarClock } from "lucide-react";

interface DeferPopoverProps {
  onDefer: (isoDate: string) => void;
}

export function DeferPopover({ onDefer }: DeferPopoverProps) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");

  function getDateISO(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString();
  }

  function getNextMonday(): string {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    return d.toISOString();
  }

  function handleOption(isoDate: string) {
    onDefer(isoDate);
    setOpen(false);
  }

  function handleCustom() {
    if (customDate) {
      onDefer(new Date(customDate).toISOString());
      setOpen(false);
      setCustomDate("");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Defer"
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        <div className="space-y-1">
          <button
            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
            onClick={() => handleOption(getDateISO(1))}
          >
            Tomorrow
          </button>
          <button
            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
            onClick={() => handleOption(getNextMonday())}
          >
            Next week
          </button>
          <div className="pt-1 border-t mt-1">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border bg-background"
            />
            {customDate && (
              <button
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors mt-1 text-primary font-medium"
                onClick={handleCustom}
              >
                Defer to {new Date(customDate).toLocaleDateString()}
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
