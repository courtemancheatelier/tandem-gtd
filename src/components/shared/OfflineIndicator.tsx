"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";

export function OfflineIndicator() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 text-sm py-2 px-4 md:hidden"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      You&apos;re offline
    </div>
  );
}
