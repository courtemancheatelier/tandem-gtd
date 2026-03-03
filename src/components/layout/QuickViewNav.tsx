"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QuickViewManager } from "./QuickViewManager";
import { Bookmark, Settings2, ChevronDown } from "lucide-react";
import {
  type QuickView,
  iconMap,
  getQuickViewsFromStorage,
  saveQuickViewsToStorage,
} from "./quick-view-types";

function buildHref(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `/do-now?${searchParams.toString()}`;
}

export function QuickViewNav({ collapsed = false, onNavItemClick, sectionCollapsed = false, onToggleSection }: { collapsed?: boolean; onNavItemClick?: () => void; sectionCollapsed?: boolean; onToggleSection?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [quickViews, setQuickViews] = useState<QuickView[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setQuickViews(getQuickViewsFromStorage());
    setMounted(true);
  }, []);

  function handleSave(views: QuickView[]) {
    saveQuickViewsToStorage(views);
    setQuickViews(views);
  }

  function isActive(params: Record<string, string>): boolean {
    if (pathname !== "/do-now") return false;
    const entries = Object.entries(params);
    if (entries.length === 0) return false;
    return entries.every(([key, value]) => searchParams.get(key) === value);
  }

  if (!mounted) return null;

  return (
    <>
      <div>
        {!collapsed && (
          <div className="flex items-center px-2 py-1">
            <button
              onClick={onToggleSection}
              className="flex-1 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Quick Views
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setManagerOpen(true)}
            >
              <Settings2 className="h-3 w-3" />
              <span className="sr-only">Manage quick views</span>
            </Button>
            <button
              onClick={onToggleSection}
              className="ml-1 text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  sectionCollapsed && "-rotate-90"
                )}
              />
            </button>
          </div>
        )}
        {!sectionCollapsed && (
        <div className="space-y-0.5">
          {quickViews.map((view) => {
            const Icon = iconMap[view.icon] || Bookmark;
            const active = isActive(view.params);
            const link = (
              <Link
                key={view.id}
                href={buildHref(view.params)}
                onClick={onNavItemClick}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: view.color }} />
                {!collapsed && view.name}
              </Link>
            );
            if (collapsed) {
              return (
                <Tooltip key={view.id}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{view.name}</TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </div>
        )}
      </div>
      <QuickViewManager
        open={managerOpen}
        onOpenChange={setManagerOpen}
        quickViews={quickViews}
        onSave={handleSave}
      />
    </>
  );
}
