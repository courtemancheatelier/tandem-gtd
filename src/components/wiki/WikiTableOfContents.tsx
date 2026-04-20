"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TocEntry } from "@/lib/hooks/use-table-of-contents";
import { useActiveHeading } from "@/lib/hooks/use-active-heading";

interface WikiTableOfContentsProps {
  entries: TocEntry[];
}

export function WikiTableOfContents({ entries }: WikiTableOfContentsProps) {
  const activeId = useActiveHeading(entries);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (entries.length < 3) return null;

  function scrollToHeading(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const tocContent = (
    <nav className="space-y-1">
      <p className="text-sm font-semibold text-muted-foreground mb-2">
        On this page
      </p>
      {entries.map((entry) => (
        <button
          key={entry.id}
          onClick={() => {
            scrollToHeading(entry.id);
            setMobileOpen(false);
          }}
          className={cn(
            "block w-full text-left text-sm py-1 transition-colors hover:text-foreground",
            entry.level === 1 && "pl-0 font-medium",
            entry.level === 2 && "pl-3",
            entry.level === 3 && "pl-6",
            entry.level === 4 && "pl-9",
            activeId === entry.id
              ? "text-primary font-medium"
              : "text-muted-foreground"
          )}
        >
          {entry.text}
        </button>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <div className="hidden lg:block sticky top-20">
        {tocContent}
      </div>

      {/* Mobile: collapsible */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Table of Contents
          </span>
          {mobileOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        {mobileOpen && (
          <div className="mt-2 rounded-md border border-border p-3">
            {tocContent}
          </div>
        )}
      </div>
    </>
  );
}
