"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { useKeyboardShortcuts, type Shortcut } from "@/lib/hooks/use-keyboard-shortcuts";

interface ShortcutDisplay {
  keys: string[];
  description: string;
  category: string;
}

interface KeyboardShortcutsContextValue {
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  shortcuts: ShortcutDisplay[];
  registerPageShortcuts: (shortcuts: Shortcut[]) => void;
  unregisterPageShortcuts: () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useShortcutsContext() {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error(
      "useShortcutsContext must be used within KeyboardShortcutsProvider"
    );
  }
  return ctx;
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
  if (typeof document !== "undefined" && isEditableElement(document.activeElement)) {
    return true;
  }
  return false;
}

export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const [pageShortcuts, setPageShortcuts] = useState<Shortcut[]>([]);

  // Leader key state for G-based navigation
  const leaderActiveRef = useRef(false);
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerPageShortcuts = useCallback((shortcuts: Shortcut[]) => {
    setPageShortcuts(shortcuts);
  }, []);

  const unregisterPageShortcuts = useCallback(() => {
    setPageShortcuts([]);
  }, []);

  // Navigation map for leader key sequences
  const navigationMap: Record<string, { path: string; label: string }> = {
    i: { path: "/inbox", label: "Inbox" },
    d: { path: "/do-now", label: "Do Now" },
    p: { path: "/projects", label: "Projects" },
    w: { path: "/waiting-for", label: "Waiting For" },
    s: { path: "/someday", label: "Someday/Maybe" },
    a: { path: "/areas", label: "Areas" },
    r: { path: "/review", label: "Weekly Review" },
  };

  // Leader key handler (G then X pattern)
  useEffect(() => {
    function handleLeaderKey(event: KeyboardEvent) {
      if (isInputElement(event.target)) return;

      // If leader is active, check for navigation key
      if (leaderActiveRef.current) {
        const key = event.key.toLowerCase();
        const nav = navigationMap[key];
        if (nav) {
          event.preventDefault();
          router.push(nav.path);
        }
        // Reset leader state regardless of whether key matched
        leaderActiveRef.current = false;
        if (leaderTimeoutRef.current) {
          clearTimeout(leaderTimeoutRef.current);
          leaderTimeoutRef.current = null;
        }
        return;
      }

      // Check for leader key activation (G without modifiers)
      if (
        event.key.toLowerCase() === "g" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        leaderActiveRef.current = true;
        // Cancel after 1 second
        leaderTimeoutRef.current = setTimeout(() => {
          leaderActiveRef.current = false;
          leaderTimeoutRef.current = null;
        }, 1000);
      }
    }

    document.addEventListener("keydown", handleLeaderKey);
    return () => {
      document.removeEventListener("keydown", handleLeaderKey);
      if (leaderTimeoutRef.current) {
        clearTimeout(leaderTimeoutRef.current);
      }
    };
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Standard shortcuts (non-leader-key)
  const appShortcuts: Shortcut[] = [
    {
      key: "i",
      ctrl: true,
      handler: () => {
        // InboxCaptureModal handles this via its own listener,
        // but we register it for the help overlay display
      },
      description: "Capture to Inbox",
      category: "Actions",
    },
    {
      key: "k",
      ctrl: true,
      handler: () => {
        // Global search — handled by its own listener when implemented
      },
      description: "Search",
      category: "Actions",
    },
    {
      key: "?",
      shift: true,
      handler: () => {
        setShowHelp((prev) => !prev);
      },
      description: "Show this help",
      category: "Global",
    },
    {
      key: "Escape",
      handler: () => {
        setShowHelp(false);
      },
      description: "Close modal",
      category: "Global",
    },
  ];

  const allStandardShortcuts = [...appShortcuts, ...pageShortcuts];

  useKeyboardShortcuts({
    shortcuts: allStandardShortcuts,
    enabled: true,
  });

  // Build display list of all shortcuts (including leader-key navigation)
  const displayShortcuts: ShortcutDisplay[] = [
    // Navigation (leader key shortcuts)
    ...Object.entries(navigationMap).map(([key, nav]) => ({
      keys: ["G", key.toUpperCase()],
      description: `Go to ${nav.label}`,
      category: "Navigation",
    })),
    // Actions
    {
      keys: ["\u2318", "I"],
      description: "Capture to Inbox",
      category: "Actions",
    },
    {
      keys: ["\u2318", "K"],
      description: "Search",
      category: "Actions",
    },
    // Global
    {
      keys: ["?"],
      description: "Show this help",
      category: "Global",
    },
    {
      keys: ["Esc"],
      description: "Close modal",
      category: "Global",
    },
    // Page-specific shortcuts
    ...pageShortcuts.map((s) => ({
      keys: [
        ...(s.ctrl ? ["\u2318"] : []),
        ...(s.shift ? ["Shift"] : []),
        ...(s.alt ? ["Alt"] : []),
        s.key.toUpperCase(),
      ],
      description: s.description,
      category: s.category || "Page",
    })),
  ];

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        showHelp,
        setShowHelp,
        shortcuts: displayShortcuts,
        registerPageShortcuts,
        unregisterPageShortcuts,
      }}
    >
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}
