"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUICK_TAGS, INTERVAL_MINUTES } from "@/lib/time-audit/constants";
import { ChallengeDayView } from "./ChallengeDayView";
import { Pause, Play, Square, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Challenge {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  pausedAt: string | null;
  totalPaused: number;
}

interface TaskResult {
  id: string;
  title: string;
}

interface Entry {
  id: string;
  intervalStart: string;
  intervalEnd: string;
  tags: string[];
  note: string | null;
  taskId: string | null;
  task: TaskResult | null;
}

interface EntryLoggerProps {
  challenge: Challenge;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChallengeUpdated: (challenge: any) => void;
}

function getCurrentInterval(challengeStart: Date): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  const ms = now.getTime() - challengeStart.getTime();
  const intervalIndex = Math.floor(ms / (INTERVAL_MINUTES * 60_000));
  const start = new Date(
    challengeStart.getTime() + intervalIndex * INTERVAL_MINUTES * 60_000
  );
  const end = new Date(start.getTime() + INTERVAL_MINUTES * 60_000);
  return { start, end };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function EntryLogger({
  challenge,
  onChallengeUpdated,
}: EntryLoggerProps) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [linkedTask, setLinkedTask] = useState<TaskResult | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskResults, setTaskResults] = useState<TaskResult[]>([]);
  const [showTaskSearch, setShowTaskSearch] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);

  const challengeStart = new Date(challenge.startTime);
  const challengeEnd = new Date(challenge.endTime);
  const isPaused = challenge.status === "PAUSED";
  const interval = getCurrentInterval(challengeStart);

  const fetchEntries = useCallback(() => {
    fetch(`/api/time-audit/${challenge.id}/entries`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});
  }, [challenge.id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Search tasks
  useEffect(() => {
    if (taskQuery.length < 2) {
      setTaskResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(taskQuery)}&type=tasks&limit=5`)
        .then((r) => r.json())
        .then((data) => {
          setTaskResults(
            (data.tasks ?? data ?? []).map((t: TaskResult) => ({
              id: t.id,
              title: t.title,
            }))
          );
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [taskQuery]);

  function toggleTag(key: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleLog() {
    if (selectedTags.size === 0) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/time-audit/${challenge.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intervalStart: interval.start.toISOString(),
          intervalEnd: interval.end.toISOString(),
          tags: Array.from(selectedTags),
          note: note || undefined,
          taskId: linkedTask?.id ?? undefined,
        }),
      });

      if (res.ok) {
        setSelectedTags(new Set());
        setNote("");
        setLinkedTask(null);
        setTaskQuery("");
        setShowTaskSearch(false);
        fetchEntries();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(status: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/time-audit/${challenge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        onChallengeUpdated(updated);
      }
    } finally {
      setUpdating(false);
    }
  }

  const timeRemaining = challengeEnd.getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(timeRemaining / 3_600_000));
  const minsLeft = Math.max(
    0,
    Math.floor((timeRemaining % 3_600_000) / 60_000)
  );

  return (
    <div className="space-y-6">
      {/* Current interval + controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {formatTime(interval.start)} &ndash; {formatTime(interval.end)}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {hoursLeft}h {minsLeft}m left
              </span>
              {isPaused ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus("ACTIVE")}
                  disabled={updating}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Resume
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus("PAUSED")}
                  disabled={updating}
                >
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatus("COMPLETED")}
                disabled={updating}
              >
                <Square className="h-3 w-3 mr-1" />
                End
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPaused && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Challenge is paused. Resume to continue logging.
            </div>
          )}

          {/* Quick tags */}
          <div>
            <p className="text-sm font-medium mb-2">What did you do?</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag.key}
                  onClick={() => toggleTag(tag.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selectedTags.has(tag.key)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <span>{tag.emoji}</span>
                  <span>{tag.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <Input
              placeholder="Optional note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Task link */}
          <div>
            {linkedTask ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  Linked: {linkedTask.title}
                  <button
                    onClick={() => {
                      setLinkedTask(null);
                      setTaskQuery("");
                    }}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    x
                  </button>
                </Badge>
              </div>
            ) : showTaskSearch ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
                    value={taskQuery}
                    onChange={(e) => setTaskQuery(e.target.value)}
                    className="pl-8 text-sm"
                    autoFocus
                  />
                </div>
                {taskResults.length > 0 && (
                  <div className="rounded-md border bg-card shadow-sm">
                    {taskResults.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => {
                          setLinkedTask(task);
                          setTaskQuery("");
                          setTaskResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent truncate"
                      >
                        {task.title}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowTaskSearch(false);
                    setTaskQuery("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTaskSearch(true)}
                className="text-muted-foreground"
              >
                <Search className="h-3 w-3 mr-1" />
                Link to task (optional)
              </Button>
            )}
          </div>

          {/* Log button */}
          <Button
            onClick={handleLog}
            disabled={selectedTags.size === 0 || submitting || isPaused}
            className="w-full"
          >
            {submitting ? "Logging..." : "Log It"}
          </Button>
        </CardContent>
      </Card>

      {/* Day timeline */}
      <ChallengeDayView
        challengeId={challenge.id}
        challengeStart={challengeStart}
        challengeEnd={challengeEnd}
        entries={entries}
        onEntryUpdated={fetchEntries}
      />
    </div>
  );
}
