"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChatPanel } from "./AIChatPanel";

/**
 * Floating button (bottom-right) that opens the AI Chat panel.
 * Hidden if the user has AI disabled in their settings.
 */
export function AIToggleButton() {
  const [open, setOpen] = React.useState(false);
  const [aiEnabled, setAiEnabled] = React.useState<boolean | null>(null);

  // Check if user has AI enabled
  React.useEffect(() => {
    let cancelled = false;

    async function checkAIStatus() {
      try {
        const res = await fetch("/api/settings/ai");
        if (!res.ok) {
          setAiEnabled(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          const serverEnabled = data.serverAiEnabled !== false;
          const serverInAppEnabled = data.serverInAppAiEnabled !== false;
          setAiEnabled(data.aiEnabled === true && data.inAppAiEnabled !== false && data.inAppAiChatEnabled !== false && serverEnabled && serverInAppEnabled);
        }
      } catch {
        if (!cancelled) {
          setAiEnabled(false);
        }
      }
    }

    checkAIStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything while loading or if AI is disabled
  if (aiEnabled === null || aiEnabled === false) {
    return null;
  }

  return (
    <>
      {/* Floating toggle button */}
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className={cn(
          "fixed z-40 h-12 w-12 rounded-full shadow-lg",
          "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "transition-all duration-200 hover:scale-105",
          // Pulse animation when not open
          !open && "animate-pulse-subtle"
        )}
        title="Open AI Assistant (Cmd+J)"
      >
        <Sparkles className="h-5 w-5" />
        <span className="sr-only">Open AI Assistant</span>
      </Button>

      {/* Chat panel */}
      <AIChatPanel open={open} onOpenChange={setOpen} />

      {/* Custom animation style */}
      <style jsx global>{`
        @keyframes pulse-subtle {
          0%, 100% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4);
          }
          50% {
            box-shadow: 0 0 0 8px hsl(var(--primary) / 0);
          }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
