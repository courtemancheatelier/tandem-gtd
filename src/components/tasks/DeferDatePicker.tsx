"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function nextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Format a Date as YYYY-MM-DD for <input type="date">. */
function toInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a date for display (e.g. "Feb 21, 2026"). */
function formatDisplay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Quick option definitions
// ---------------------------------------------------------------------------

interface QuickOption {
  label: string;
  getDate: () => Date;
}

function getQuickOptions(): QuickOption[] {
  const now = new Date();
  return [
    { label: "Tomorrow", getDate: () => addDays(now, 1) },
    { label: "Next Week", getDate: () => nextMonday(now) },
    { label: "Next Month", getDate: () => addMonths(now, 1) },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DeferDatePickerProps {
  /** Current defer/scheduled date (ISO string or Date), or null if none. */
  value: string | Date | null;
  /** Called when the user picks a new date. Receives ISO string or null. */
  onChange: (date: string | null) => void;
  /** Optional className applied to the trigger button. */
  className?: string;
  /** If true, show a compact (icon-only) trigger button. */
  compact?: boolean;
}

export function DeferDatePicker({
  value,
  onChange,
  className,
  compact = false,
}: DeferDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const currentDate = value ? new Date(value) : null;
  const isFuture =
    currentDate && currentDate > new Date(new Date().setHours(23, 59, 59, 999));

  function handleQuickPick(date: Date) {
    onChange(date.toISOString());
    setOpen(false);
    setShowCustom(false);
  }

  function handleCustomDate(dateStr: string) {
    if (!dateStr) return;
    // Create date at noon to avoid timezone edge cases
    const date = new Date(dateStr + "T12:00:00");
    onChange(date.toISOString());
    setOpen(false);
    setShowCustom(false);
  }

  function handleClear() {
    onChange(null);
    setOpen(false);
    setShowCustom(false);
  }

  const quickOptions = getQuickOptions();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isFuture ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 text-xs gap-1",
            isFuture && "text-amber-600 dark:text-amber-400",
            className
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {!compact && (
            <span>
              {currentDate ? formatDisplay(currentDate) : "Defer"}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-2">
        <div className="space-y-1">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Defer until
          </p>

          {/* Quick options */}
          {quickOptions.map((opt) => (
            <button
              key={opt.label}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => handleQuickPick(opt.getDate())}
            >
              <span>{opt.label}</span>
              <span className="text-xs text-muted-foreground">
                {formatDisplay(opt.getDate())}
              </span>
            </button>
          ))}

          {/* Custom date toggle */}
          {!showCustom ? (
            <button
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => setShowCustom(true)}
            >
              <span>Custom date</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ) : (
            <div className="px-2 py-1.5">
              <Input
                type="date"
                className="h-8 text-sm"
                min={toInputDate(addDays(new Date(), 1))}
                defaultValue={
                  currentDate && isFuture
                    ? toInputDate(currentDate)
                    : toInputDate(addDays(new Date(), 1))
                }
                onChange={(e) => handleCustomDate(e.target.value)}
              />
            </div>
          )}

          {/* Clear defer date */}
          {currentDate && (
            <>
              <div className="my-1 border-t" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleClear}
              >
                <X className="h-3.5 w-3.5" />
                Remove defer date
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
