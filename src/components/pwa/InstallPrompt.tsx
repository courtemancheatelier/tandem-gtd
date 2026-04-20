"use client";

import { useEffect, useState, useCallback } from "react";

const DISMISS_KEY = "tandem-pwa-install-dismissed";
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Shows a dismissible banner suggesting the user install the PWA.
 *
 * Listens for the browser's `beforeinstallprompt` event. Once fired,
 * the banner appears unless the user previously dismissed it (stored
 * in localStorage for 30 days).
 *
 * Usage in root layout:
 *   <InstallPrompt />
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Check if the user previously dismissed the prompt
  const wasDismissed = useCallback(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const dismissedAt = Number(raw);
      if (Date.now() - dismissedAt < DISMISS_DURATION_MS) return true;
      // Expired — clear it
      localStorage.removeItem(DISMISS_KEY);
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // User dismissed recently
    if (wasDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [wasDismissed]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setVisible(false);
    }
    // Clear the prompt regardless — it can only be used once
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    setDeferredPrompt(null);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // localStorage may be unavailable
    }
  };

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install Tandem GTD"
      style={{
        position: "fixed",
        bottom: isMobile ? "5rem" : "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        backgroundColor: "#0f172a",
        color: "#ffffff",
        borderRadius: "0.5rem",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: "0.875rem",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      <span>Install Tandem for a better experience.</span>

      <button
        onClick={handleInstall}
        style={{
          padding: "0.375rem 0.75rem",
          backgroundColor: "hsl(220, 70%, 50%)",
          color: "#ffffff",
          border: "none",
          borderRadius: "0.375rem",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        Install
      </button>

      <button
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        style={{
          background: "none",
          border: "none",
          color: "#94a3b8",
          cursor: "pointer",
          fontSize: "1.25rem",
          lineHeight: 1,
          padding: "0 0.25rem",
        }}
      >
        {"\u00d7"}
      </button>
    </div>
  );
}
