"use client";

import { ArrowDown, Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  isPastThreshold: boolean;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  isPastThreshold,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  // Arrow rotates from 0° to 180° as pull progresses
  const rotation = Math.min((pullDistance / 80) * 180, 180);

  return (
    <div
      className="flex items-center justify-center overflow-hidden md:hidden"
      style={{ height: pullDistance }}
    >
      {isRefreshing ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <ArrowDown
          className={`h-5 w-5 transition-colors ${
            isPastThreshold ? "text-primary" : "text-muted-foreground"
          }`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      )}
    </div>
  );
}
