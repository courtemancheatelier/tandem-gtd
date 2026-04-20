"use client";

import { useEffect, useState, useCallback } from "react";
import { StartChallengeDialog } from "./StartChallengeDialog";
import { EntryLogger } from "./EntryLogger";
import { ChallengeHistory } from "./ChallengeHistory";
import { ChallengeSummary } from "./ChallengeSummary";
import { Button } from "@/components/ui/button";
import { Clock, Plus } from "lucide-react";
import type { TimeAuditSummary } from "@/lib/time-audit/summary";

interface Challenge {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  pausedAt: string | null;
  totalPaused: number;
  summary: TimeAuditSummary | null;
  createdAt: string;
  _count?: { entries: number };
}

export function TimeAuditPage() {
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showStart, setShowStart] = useState(false);
  const [viewingSummary, setViewingSummary] = useState<TimeAuditSummary | null>(
    null
  );

  const fetchActive = useCallback(() => {
    fetch("/api/time-audit/active")
      .then((r) => {
        if (r.status === 204) {
          setActiveChallenge(null);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setActiveChallenge(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  function handleChallengeCreated(challenge: Challenge) {
    setActiveChallenge(challenge);
    setShowStart(false);
  }

  function handleChallengeUpdated(challenge: Challenge) {
    if (
      challenge.status === "COMPLETED" ||
      challenge.status === "ABANDONED"
    ) {
      setActiveChallenge(null);
      if (challenge.status === "COMPLETED" && challenge.summary) {
        setViewingSummary(challenge.summary);
      }
    } else {
      setActiveChallenge(challenge);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Viewing a summary from history
  if (viewingSummary) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Challenge Summary
          </h1>
          <Button variant="outline" onClick={() => setViewingSummary(null)}>
            Back
          </Button>
        </div>
        <ChallengeSummary summary={viewingSummary} />
      </div>
    );
  }

  // Active challenge — show logger
  if (activeChallenge) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Time Audit Challenge
          </h1>
          <p className="text-sm text-muted-foreground">
            Log what you did every 15 minutes
          </p>
        </div>
        <EntryLogger
          challenge={activeChallenge}
          onChallengeUpdated={handleChallengeUpdated}
        />
      </div>
    );
  }

  // No active challenge — show start + history
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Time Audit Challenge
          </h1>
          <p className="text-sm text-muted-foreground">
            See where your time actually goes vs. what your GTD system thinks
          </p>
        </div>
        <Button onClick={() => setShowStart(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Start Challenge
        </Button>
      </div>

      <StartChallengeDialog
        open={showStart}
        onOpenChange={setShowStart}
        onCreated={handleChallengeCreated}
      />

      <ChallengeHistory onViewSummary={setViewingSummary} />
    </div>
  );
}
