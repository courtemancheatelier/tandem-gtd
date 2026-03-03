"use client";

import { useState, useEffect } from "react";
import type { TocEntry } from "./use-table-of-contents";

/**
 * Track which heading is currently in the viewport using IntersectionObserver.
 */
export function useActiveHeading(entries: TocEntry[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        // Find the first visible heading
        for (const entry of observerEntries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: 0,
      }
    );

    const headingIds = entries.map((e) => e.id);
    for (const id of headingIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [entries]);

  return activeId;
}
