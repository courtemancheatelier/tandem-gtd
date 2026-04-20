"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QUICK_TAG_MAP, INTERVAL_MINUTES } from "@/lib/time-audit/constants";
import { Trash2, Edit2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUICK_TAGS } from "@/lib/time-audit/constants";

interface Entry {
  id: string;
  intervalStart: string;
  intervalEnd: string;
  tags: string[];
  note: string | null;
  taskId: string | null;
  task: { id: string; title: string } | null;
}

interface ChallengeDayViewProps {
  challengeId: string;
  challengeStart: Date;
  challengeEnd: Date;
  entries: Entry[];
  onEntryUpdated: () => void;
}

interface Slot {
  start: Date;
  end: Date;
  entry: Entry | null;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChallengeDayView({
  challengeId,
  challengeStart,
  challengeEnd,
  entries,
  onEntryUpdated,
}: ChallengeDayViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTags, setEditTags] = useState<Set<string>>(new Set());

  // Build slots
  const slots: Slot[] = [];
  let current = new Date(challengeStart);
  const end = new Date(Math.min(challengeEnd.getTime(), Date.now()));

  while (current < end) {
    const slotEnd = new Date(
      current.getTime() + INTERVAL_MINUTES * 60_000
    );
    const entry =
      entries.find(
        (e) =>
          new Date(e.intervalStart).getTime() === current.getTime()
      ) ?? null;
    slots.push({ start: new Date(current), end: slotEnd, entry });
    current = slotEnd;
  }

  // Show newest first
  const displaySlots = [...slots].reverse();

  async function handleDelete(entryId: string) {
    await fetch(
      `/api/time-audit/${challengeId}/entries/${entryId}`,
      { method: "DELETE" }
    );
    onEntryUpdated();
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditTags(new Set(entry.tags));
  }

  async function saveEdit(entryId: string) {
    await fetch(
      `/api/time-audit/${challengeId}/entries/${entryId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: Array.from(editTags) }),
      }
    );
    setEditingId(null);
    onEntryUpdated();
  }

  async function handleQuickLog(slot: Slot, tags: string[]) {
    await fetch(`/api/time-audit/${challengeId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intervalStart: slot.start.toISOString(),
        intervalEnd: slot.end.toISOString(),
        tags,
      }),
    });
    onEntryUpdated();
  }

  const loggedCount = entries.length;
  const totalSlots = slots.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Today&apos;s Timeline
          <span className="text-sm font-normal text-muted-foreground ml-2">
            {loggedCount}/{totalSlots} intervals logged
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displaySlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No intervals yet. Start logging!
          </p>
        ) : (
          <div className="space-y-1">
            {displaySlots.map((slot, i) => {
              const isEditing = slot.entry?.id === editingId;

              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                    slot.entry
                      ? "bg-card border"
                      : "border border-dashed border-muted-foreground/30"
                  )}
                >
                  <span className="w-24 shrink-0 text-muted-foreground text-xs">
                    {formatTime(slot.start)}
                  </span>

                  {slot.entry ? (
                    isEditing ? (
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        {QUICK_TAGS.map((tag) => (
                          <button
                            key={tag.key}
                            onClick={() => {
                              const next = new Set(editTags);
                              if (next.has(tag.key)) next.delete(tag.key);
                              else next.add(tag.key);
                              setEditTags(next);
                            }}
                            className={cn(
                              "text-xs rounded-full px-2 py-0.5 border",
                              editTags.has(tag.key)
                                ? "border-primary bg-primary/10"
                                : "border-border"
                            )}
                          >
                            {tag.emoji}
                          </button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => saveEdit(slot.entry!.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                          {slot.entry.tags.map((tag) => {
                            const info = QUICK_TAG_MAP.get(tag);
                            return (
                              <span
                                key={tag}
                                className="text-sm"
                                title={info?.label ?? tag}
                              >
                                {info?.emoji ?? tag}
                              </span>
                            );
                          })}
                          {slot.entry.note && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {slot.entry.note}
                            </span>
                          )}
                          {slot.entry.task && (
                            <span className="text-xs text-primary truncate max-w-[150px]">
                              {slot.entry.task.title}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground"
                            onClick={() => startEdit(slot.entry!)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(slot.entry!.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )
                  ) : (
                    <button
                      onClick={() => {
                        // Quick-log empty slot with most common pattern
                        handleQuickLog(slot, ["task_work"]);
                      }}
                      className="flex-1 text-xs text-muted-foreground/50 hover:text-muted-foreground"
                    >
                      Tap to fill in...
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
