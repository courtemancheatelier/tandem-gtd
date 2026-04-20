"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "./MobileNavContext";
import { useKeyboardVisible } from "@/lib/hooks/use-keyboard-visible";
import { DEFAULT_TOOLBAR_IDS, getToolbarConfig, resolveToolbarItems } from "./bottom-toolbar-config";
import type { ToolbarItem } from "./bottom-toolbar-config";

export function BottomTabBar() {
  const pathname = usePathname();
  const { setDrawerOpen } = useMobileNav();
  const keyboardOpen = useKeyboardVisible();
  const [tabs, setTabs] = useState<ToolbarItem[]>(() => resolveToolbarItems(DEFAULT_TOOLBAR_IDS));

  const loadConfig = useCallback(() => {
    const ids = getToolbarConfig();
    setTabs(resolveToolbarItems(ids));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Re-read config when changed from settings
  useEffect(() => {
    function onConfigChanged() {
      loadConfig();
    }
    window.addEventListener("toolbar-config-changed", onConfigChanged);
    return () => window.removeEventListener("toolbar-config-changed", onConfigChanged);
  }, [loadConfig]);

  if (keyboardOpen) return null;

  function isActive(href: string) {
    // Prevent /projects from matching /projects/outline
    if (href === "/projects") return pathname === "/projects" || (pathname.startsWith("/projects/") && !pathname.startsWith("/projects/outline"));
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around min-h-[56px]">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors"
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
