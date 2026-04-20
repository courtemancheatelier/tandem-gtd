"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardVisible } from "@/lib/hooks/use-keyboard-visible";

interface BottomFilterTrayProps {
  activeFilterCount: number;
  children: ReactNode;
  /** Extra action buttons rendered next to the filter pill (e.g. New Project +) */
  actions?: ReactNode;
}

export function BottomFilterTray({
  activeFilterCount,
  children,
  actions,
}: BottomFilterTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const keyboardOpen = useKeyboardVisible();

  // Close tray when navigating away (URL change) or keyboard opens
  useEffect(() => {
    if (keyboardOpen) setExpanded(false);
  }, [keyboardOpen]);

  if (keyboardOpen) return null;

  return (
    <>
      {/* Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-[34] bg-black/30 md:hidden"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Tray container */}
      <div
        className={cn(
          "fixed inset-x-0 z-[35] md:hidden",
          "bottom-[calc(56px+env(safe-area-inset-bottom))]"
        )}
      >
        {/* Expanded filter panel */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-out",
            expanded ? "max-h-[60vh] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="mx-3 mb-2 rounded-lg border bg-card p-3 shadow-lg">
            {children}
          </div>
        </div>

        {/* Collapsed pill bar */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors",
              expanded
                ? "bg-primary text-primary-foreground border-primary"
                : activeFilterCount > 0
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-card text-muted-foreground border-border"
            )}
          >
            <Filter className="h-3 w-3" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                {activeFilterCount}
              </span>
            )}
          </button>
          {actions}
        </div>
      </div>
    </>
  );
}
