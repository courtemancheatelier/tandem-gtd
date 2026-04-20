"use client";

import { useEffect, useRef, useCallback } from "react";

export interface Shortcut {
  key: string;
  ctrl?: boolean; // Cmd on Mac, Ctrl on Windows
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description: string;
  category?: string;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: Shortcut[];
  enabled?: boolean;
}

function isEditableElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if (el.isContentEditable) return true;
  return false;
}

function isInputElement(target: EventTarget | null): boolean {
  if (target instanceof Element && isEditableElement(target)) return true;
  // Fall back to document.activeElement — in rare cases the event target
  // isn't the focused element (e.g. portals, autoFocus timing).
  if (typeof document !== "undefined" && isEditableElement(document.activeElement)) {
    return true;
  }
  return false;
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (isInputElement(event.target)) return;

      for (const shortcut of shortcutsRef.current) {
        const ctrlMatch = shortcut.ctrl
          ? event.metaKey || event.ctrlKey
          : !event.metaKey && !event.ctrlKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        // Normalize key comparison: for "?" we need to check the actual key value
        const keyMatch =
          event.key.toLowerCase() === shortcut.key.toLowerCase() ||
          event.key === shortcut.key;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}
