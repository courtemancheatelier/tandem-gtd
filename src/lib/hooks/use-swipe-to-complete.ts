"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { hapticMedium } from "@/lib/haptics";

interface UseSwipeToCompleteOptions {
  onSwipeComplete: () => void;
  threshold?: number;
  disabled?: boolean;
}

interface UseSwipeToCompleteReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  swipeOffset: number;
  isSwiping: boolean;
  isPastThreshold: boolean;
}

export function useSwipeToComplete({
  onSwipeComplete,
  threshold = 120,
  disabled = false,
}: UseSwipeToCompleteOptions): UseSwipeToCompleteReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchState = useRef({
    startX: 0,
    startY: 0,
    locked: false as false | "horizontal" | "vertical",
    hapticFired: false,
    active: false,
  });

  const isPastThreshold = swipeOffset >= threshold;

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        locked: false,
        hapticFired: false,
        active: true,
      };
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      const state = touchState.current;
      if (!state.active || disabled) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;

      // Direction lock after 10px of movement
      if (!state.locked) {
        const absDx = Math.abs(deltaX);
        const absDy = Math.abs(deltaY);
        if (absDx < 10 && absDy < 10) return;
        state.locked = absDx > absDy ? "horizontal" : "vertical";
      }

      if (state.locked === "vertical") return;

      // Right-only swipe
      if (deltaX <= 0) {
        setSwipeOffset(0);
        setIsSwiping(false);
        return;
      }

      setIsSwiping(true);

      // Rubber-band past threshold
      const offset =
        deltaX <= threshold
          ? deltaX
          : threshold + (deltaX - threshold) * 0.3;
      setSwipeOffset(offset);

      // Haptic at threshold crossing
      if (offset >= threshold && !state.hapticFired) {
        state.hapticFired = true;
        hapticMedium();
      }
    },
    [disabled, threshold]
  );

  const handleTouchEnd = useCallback(() => {
    const state = touchState.current;
    state.active = false;

    if (!isSwiping) return;

    if (swipeOffset >= threshold) {
      // Animate off-screen then fire callback
      setSwipeOffset(window.innerWidth);
      setTimeout(() => {
        onSwipeComplete();
        // Reset after completion fires
        setSwipeOffset(0);
        setIsSwiping(false);
      }, 200);
    } else {
      // Spring back
      setSwipeOffset(0);
      setIsSwiping(false);
    }
  }, [isSwiping, swipeOffset, threshold, onSwipeComplete]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, swipeOffset, isSwiping, isPastThreshold };
}
