"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Registers the service worker and handles update notifications.
 *
 * Drop this component into the root layout to enable PWA functionality:
 *   <ServiceWorkerRegistration />
 *
 * When a new service worker version is detected, a banner is shown
 * allowing the user to reload and apply the update.
 */
export function ServiceWorkerRegistration() {
  const updateBannerRef = useRef<HTMLDivElement | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  const showUpdateBanner = useCallback(() => {
    // Avoid duplicates
    if (updateBannerRef.current) return;

    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    const banner = document.createElement("div");
    banner.setAttribute("role", "alert");
    banner.setAttribute("aria-live", "polite");
    Object.assign(banner.style, {
      position: "fixed",
      bottom: isMobile ? "5rem" : "1rem",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "9999",
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
    });

    const text = document.createElement("span");
    text.textContent = "A new version of Tandem is available.";

    const reloadBtn = document.createElement("button");
    reloadBtn.textContent = "Update";
    Object.assign(reloadBtn.style, {
      padding: "0.375rem 0.75rem",
      backgroundColor: "hsl(220, 70%, 50%)",
      color: "#ffffff",
      border: "none",
      borderRadius: "0.375rem",
      cursor: "pointer",
      fontSize: "0.875rem",
      fontWeight: "500",
      whiteSpace: "nowrap",
    });

    reloadBtn.addEventListener("click", () => {
      if (waitingWorkerRef.current) {
        waitingWorkerRef.current.postMessage({ type: "SKIP_WAITING" });
      }
      window.location.reload();
    });

    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "\u00d7";
    dismissBtn.setAttribute("aria-label", "Dismiss update notice");
    Object.assign(dismissBtn.style, {
      background: "none",
      border: "none",
      color: "#94a3b8",
      cursor: "pointer",
      fontSize: "1.25rem",
      lineHeight: "1",
      padding: "0 0.25rem",
    });

    dismissBtn.addEventListener("click", () => {
      banner.remove();
      updateBannerRef.current = null;
    });

    banner.appendChild(text);
    banner.appendChild(reloadBtn);
    banner.appendChild(dismissBtn);
    document.body.appendChild(banner);
    updateBannerRef.current = banner;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // In dev mode, unregister all SWs and nuke caches to prevent stale workers.
    // In production, use normal SW update flow to preserve push subscriptions.
    async function cleanupAndRegister() {
      if (process.env.NODE_ENV === "development") {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        return;
      }

      return register();
    }

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates periodically (every 60 minutes)
        const updateInterval = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // A new SW is already waiting (e.g. user opened a stale tab)
        if (registration.waiting) {
          waitingWorkerRef.current = registration.waiting;
          showUpdateBanner();
        }

        // A new SW has been found and is installing
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New SW is installed but waiting to activate
              waitingWorkerRef.current = newWorker;
              showUpdateBanner();
            }
          });
        });

        return () => clearInterval(updateInterval);
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    }

    cleanupAndRegister();

    // When the controlling SW changes (after skipWaiting), reload
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      if (updateBannerRef.current) {
        updateBannerRef.current.remove();
        updateBannerRef.current = null;
      }
    };
  }, [showUpdateBanner]);

  // This component renders nothing — it only has side effects
  return null;
}
