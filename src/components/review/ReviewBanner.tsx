"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ReviewBanner() {
  const [hasActiveReview, setHasActiveReview] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/reviews/current");
        if (res.ok) {
          const data = await res.json();
          setHasActiveReview(!!data);
        }
      } catch {
        // Silently fail
      }
    }
    check();
  }, []);

  if (!hasActiveReview) return null;

  return (
    <Link
      href="/review"
      className="flex items-center justify-between px-4 py-2.5 rounded-lg border bg-primary/5 border-primary/20 hover:bg-primary/10 transition-colors mb-6"
    >
      <span className="text-sm font-medium">
        Weekly Review in progress
      </span>
      <span className="text-sm text-primary flex items-center gap-1">
        Return to Review
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
