"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const { data: session } = useSession();

  if (!session?.user?.isTrial || !session.user.trialExpiresAt) {
    return null;
  }

  const expiresAt = new Date(session.user.trialExpiresAt);
  const now = new Date();
  const msLeft = expiresAt.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  const isUrgent = daysLeft <= 7;

  if (daysLeft <= 0) {
    return null; // Middleware handles redirect
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 text-sm border-b",
        isUrgent
          ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800"
          : "bg-primary/5 text-foreground border-border"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="h-4 w-4 shrink-0" />
        <span className="truncate">
          <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong> left in
          your trial
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs">
        <a
          href="https://manage.tandemgtd.com/checkout"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Keep hosting
        </a>
        <Link
          href="/trial-ended"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Self-host
        </Link>
      </div>
    </div>
  );
}
