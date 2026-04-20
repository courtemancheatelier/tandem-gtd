"use client";

import { Button } from "@/components/ui/button";
import { Menu, Plus, Search } from "lucide-react";
import { useMobileNav } from "./MobileNavContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function MobileHeader() {
  const { setDrawerOpen } = useMobileNav();

  function openCapture() {
    // Trigger InboxCaptureModal via synthetic Cmd+I event
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "i",
        code: "KeyI",
        metaKey: true,
        bubbles: true,
      })
    );
  }

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
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 backdrop-blur px-3 md:hidden"
      style={{
        minHeight: "calc(3rem + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setDrawerOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open navigation</span>
      </Button>

      <span className="flex items-center text-sm font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tandem-logo.svg" alt="T" className="h-5 w-5 -mr-0.5" />
        andem
      </span>

      <div className="flex items-center gap-2">
        <NotificationBell popoverSide="bottom" popoverAlign="end" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={openCapture}
        >
          <Plus className="h-5 w-5" />
          <span className="sr-only">Quick capture</span>
        </Button>
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
