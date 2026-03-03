"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the virtual keyboard is open (viewport height shrinks significantly).
 * Used by BottomTabBar and BottomFilterTray to hide when the keyboard appears.
 */
export function useKeyboardVisible() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      if (!vv) return;
      setKeyboardOpen(vv.height < window.innerHeight * 0.75);
    }

    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return keyboardOpen;
}
