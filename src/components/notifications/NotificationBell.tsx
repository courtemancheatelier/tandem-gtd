"use client";

import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { useUnreadCount } from "@/lib/hooks/use-notifications";
import { NotificationPanel } from "./NotificationPanel";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  collapsed?: boolean;
  popoverSide?: "right" | "bottom";
  popoverAlign?: "start" | "end";
}

export function NotificationBell({ collapsed = false, popoverSide = "right", popoverAlign = "start" }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { count, refetch } = useUnreadCount();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground",
            collapsed ? "justify-center px-2 py-1.5 w-full" : "gap-3 px-2 py-1.5 w-full"
          )}
        >
          <Bell className={cn("h-4 w-4 shrink-0", count > 0 && "text-blue-500")} />
          {!collapsed && "Notifications"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align={popoverAlign}
        side={popoverSide}
        sideOffset={8}
      >
        <NotificationPanel
          onClose={() => setOpen(false)}
          onCountChange={refetch}
        />
      </PopoverContent>
    </Popover>
  );
}
