"use client";

import { Button } from "@/components/ui/button";
import { Menu, Search } from "lucide-react";
import { useMobileNav } from "./MobileNavContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function MobileHeader() {
  const { setDrawerOpen } = useMobileNav();

  function openSearch() {
    // Trigger GlobalSearch via synthetic Cmd+K event
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        metaKey: true,
        bubbles: true,
      })
    );
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-card/95 backdrop-blur px-3 md:hidden">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setDrawerOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open navigation</span>
      </Button>

      <span className="text-sm font-semibold">Tandem</span>

      <div className="flex items-center gap-1">
        <NotificationBell popoverSide="bottom" popoverAlign="end" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={openSearch}
        >
          <Search className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </Button>
      </div>
    </header>
  );
}
