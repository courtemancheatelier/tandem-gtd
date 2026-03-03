"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook that tracks unread notification count.
 * Fetches on mount and refetches when the tab becomes visible (no polling timer).
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.count);
      }
    } catch {
      // ignore fetch errors
    }
  }, []);

  useEffect(() => {
    fetchCount();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchCount();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchCount]);

  return { count, refetch: fetchCount };
}
