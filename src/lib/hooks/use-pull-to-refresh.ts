"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isRefreshing: boolean;
  isPastThreshold: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const touchState = useRef({
    startY: 0,
    pulling: false,
  });

  const isPastThreshold = pullDistance >= threshold;

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing) return;
      // Only activate when scroll container is at the top
      const main = document.querySelector("main.flex-1");
      if (!main || main.scrollTop > 0) return;

      touchState.current.startY = e.touches[0].clientY;
      touchState.current.pulling = true;
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchState.current.pulling) return;

      const deltaY = e.touches[0].clientY - touchState.current.startY;
      if (deltaY <= 0) {
        setPullDistance(0);
        return;
      }

      // Rubber-band resistance
      setPullDistance(deltaY * 0.4);
    },
    []
  );

  const handleTouchEnd = useCallback(async () => {
    if (!touchState.current.pulling) return;
    touchState.current.pulling = false;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Hold at threshold during refresh
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  useEffect(() => {
    if (disabled) return;

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing, isPastThreshold };
}
