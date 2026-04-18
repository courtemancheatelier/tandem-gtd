"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActiveChallenge {
  id: string;
  endTime: string;
  status: string;
}

export function ActiveChallengeBar() {
  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    fetch("/api/time-audit/active")
      .then((r) => {
        if (r.status === 204) return null;
        return r.json();
      })
      .then((data) => {
        if (data) setChallenge(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!challenge) return;

    function updateTime() {
      const end = new Date(challenge!.endTime).getTime();
      const remaining = end - Date.now();
      if (remaining <= 0) {
        setTimeLeft("ended");
        return;
      }
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      setTimeLeft(`${h}h ${m}m left`);
    }

    updateTime();
    const interval = setInterval(updateTime, 60_000);
    return () => clearInterval(interval);
  }, [challenge]);

  if (!challenge) return null;

  return (
    <div className="flex items-center justify-between bg-primary/10 border-b border-primary/20 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Time Audit Active</span>
        <span className="text-muted-foreground">{timeLeft}</span>
      </div>
      <Link href="/time-audit">
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
          Log Now
        </Button>
      </Link>
    </div>
  );
}
