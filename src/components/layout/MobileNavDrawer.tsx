"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Nav } from "./nav";
import { useMobileNav } from "./MobileNavContext";

export function MobileNavDrawer() {
  const { drawerOpen, setDrawerOpen } = useMobileNav();

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Nav collapsed={false} onNavItemClick={() => setDrawerOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
