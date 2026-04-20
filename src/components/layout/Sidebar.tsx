"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Nav } from "./nav";

const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    setMounted(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r bg-card md:block transition-all duration-200",
        mounted ? (collapsed ? "w-14" : "w-48") : "w-48"
      )}
    >
      <Nav collapsed={mounted && collapsed} onToggleCollapse={toggle} />
    </aside>
  );
}
