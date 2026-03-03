"use client";

import React, { useEffect, useRef } from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useShortcutsContext } from "@/components/shared/KeyboardShortcutsProvider";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
      {children}
    </kbd>
  );
}

export function ShortcutOverlay() {
  const { showHelp, setShowHelp, shortcuts } = useShortcutsContext();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on click outside the card
  useEffect(() => {
    if (!showHelp) return;

    function handleClick(event: MouseEvent) {
      if (
        overlayRef.current &&
        event.target instanceof Node &&
        !overlayRef.current.contains(event.target)
      ) {
        setShowHelp(false);
      }
    }

    // Delay adding listener to avoid the same click that opened it from closing it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [showHelp, setShowHelp]);

  if (!showHelp) return null;

  // Group shortcuts by category
  const categoryOrder = ["Navigation", "Actions", "Global", "Page"];
  const grouped = new Map<string, typeof shortcuts>();

  for (const shortcut of shortcuts) {
    const cat = shortcut.category;
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(shortcut);
  }

  // Sort categories by the defined order
  const sortedCategories = Array.from(grouped.entries()).sort(
    ([a], [b]) =>
      (categoryOrder.indexOf(a) === -1 ? 999 : categoryOrder.indexOf(a)) -
      (categoryOrder.indexOf(b) === -1 ? 999 : categoryOrder.indexOf(b))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={overlayRef}
        className={cn(
          "w-full max-w-md rounded-lg border bg-background p-6 shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Keyboard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
        </div>

        <Separator className="mb-4" />

        {/* Shortcut groups */}
        <div className="space-y-5 max-h-[60vh] overflow-y-auto">
          {sortedCategories.map(([category, items], groupIndex) => (
            <div key={category}>
              {groupIndex > 0 && <Separator className="mb-4" />}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((shortcut, i) => (
                  <div
                    key={`${category}-${i}`}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, ki) => (
                        <React.Fragment key={ki}>
                          {ki > 0 && category === "Navigation" && (
                            <span className="text-xs text-muted-foreground mx-0.5">
                              then
                            </span>
                          )}
                          {ki > 0 && category !== "Navigation" && (
                            <span className="text-xs text-muted-foreground mx-0.5">
                              +
                            </span>
                          )}
                          <Kbd>{key}</Kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <Separator className="mt-4 mb-3" />
        <p className="text-center text-xs text-muted-foreground">
          Press <Kbd>Esc</Kbd> to close
        </p>
      </div>
    </div>
  );
}
