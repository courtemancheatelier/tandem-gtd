"use client";

import { formatFieldChange } from "@/lib/history/format";
import { cn } from "@/lib/utils";

interface DiffDisplayProps {
  changes: Record<string, { old: unknown; new: unknown }>;
  className?: string;
}

export function DiffDisplay({ changes, className }: DiffDisplayProps) {
  const HIDDEN_FIELDS = new Set(["isNextAction"]);
  const entries = Object.entries(changes).filter(([field]) => !HIDDEN_FIELDS.has(field));

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-1", className)}>
      {entries.map(([field, { old: oldVal, new: newVal }]) => (
        <div
          key={field}
          className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1"
        >
          {formatFieldChange(field, oldVal, newVal)}
        </div>
      ))}
    </div>
  );
}
