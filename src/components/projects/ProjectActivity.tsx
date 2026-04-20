"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { EventItem, type EventItemData } from "@/components/history/EventItem";
import { groupEventsByDate } from "@/lib/history/format";
import { History, Loader2, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectActivityProps {
  projectId: string;
  /** Tasks belonging to this project — used to fetch task events and show titles */
  tasks: { id: string; title: string }[];
}

const THREAD_EVENTS = new Set(["THREAD_OPENED", "THREAD_RESOLVED"]);
const DECISION_EVENTS = new Set(["DECISION_REQUESTED", "DECISION_RESOLVED"]);

const CATEGORIES = [
  { value: "all", label: "All activity" },
  { value: "threads", label: "Threads" },
  { value: "decisions", label: "Decisions" },
  { value: "tasks", label: "Tasks" },
  { value: "projects", label: "Projects" },
];

export function ProjectActivity({ projectId, tasks }: ProjectActivityProps) {
  const [allEvents, setAllEvents] = useState<EventItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState("all");
  const [actorId, setActorId] = useState("all");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const taskTitleMap = new Map(tasks.map((t) => [t.id, t.title]));

      // Fetch project events and task events in parallel
      const [projRes, ...taskResults] = await Promise.all([
        fetch(`/api/projects/${projectId}/history?limit=30`),
        // Fetch task events for each task (batched — only first 20 tasks to avoid too many requests)
        ...tasks.slice(0, 20).map((t) =>
          fetch(`/api/tasks/${t.id}/history?limit=10`)
        ),
      ]);

      const events: EventItemData[] = [];

      if (projRes.ok) {
        const data = await projRes.json();
        const projEvents = (data.events ?? []).map((e: EventItemData) => ({
          ...e,
          entityType: "project" as const,
          entityTitle: "Project",
          projectId,
        }));
        events.push(...projEvents);
      }

      for (let i = 0; i < taskResults.length; i++) {
        const res = taskResults[i];
        if (res.ok) {
          const data = await res.json();
          const task = tasks[i];
          const taskTitle = taskTitleMap.get(task?.id) ?? "Task";
          const taskEvents = (data.events ?? []).map((e: EventItemData) => ({
            ...e,
            entityType: "task" as const,
            entityTitle: e.entityTitle || taskTitle,
            taskId: task?.id,
            projectId,
          }));
          events.push(...taskEvents);
        }
      }

      // Sort by date descending, take latest 50
      events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllEvents(events.slice(0, 50));
    } finally {
      setLoading(false);
    }
  }, [projectId, tasks]);

  useEffect(() => {
    if (expanded && allEvents.length === 0) {
      fetchEvents();
    }
  }, [expanded, allEvents.length, fetchEvents]);

  // Derive unique actors from loaded events
  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of allEvents) {
      if (e.actorName && e.actorName !== "System" && e.actorName !== "AI Assistant") {
        // Use actorName as key since we don't have actorId on EventItemData
        map.set(e.actorName, e.actorName);
      }
    }
    return Array.from(map.values()).sort();
  }, [allEvents]);

  // Apply client-side filters
  const filteredEvents = useMemo(() => {
    let filtered = allEvents;

    if (category === "threads") {
      filtered = filtered.filter((e) => THREAD_EVENTS.has(e.eventType));
    } else if (category === "decisions") {
      filtered = filtered.filter((e) => DECISION_EVENTS.has(e.eventType));
    } else if (category === "tasks") {
      filtered = filtered.filter((e) => e.entityType === "task" && !THREAD_EVENTS.has(e.eventType) && !DECISION_EVENTS.has(e.eventType));
    } else if (category === "projects") {
      filtered = filtered.filter((e) => e.entityType === "project" && !THREAD_EVENTS.has(e.eventType) && !DECISION_EVENTS.has(e.eventType));
    }

    if (actorId !== "all") {
      filtered = filtered.filter((e) => e.actorName === actorId);
    }

    return filtered;
  }, [allEvents, category, actorId]);

  const grouped = groupEventsByDate(filteredEvents);
  const hasFilters = category !== "all" || actorId !== "all";

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <History className="h-4 w-4" />
        Activity
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-3">
          {/* Filters */}
          {!loading && allEvents.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {actors.length > 1 && (
                <Select value={actorId} onValueChange={setActorId}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="All people" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All people</SelectItem>
                    {actors.map((name) => (
                      <SelectItem key={name} value={name} className="text-xs">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => { setCategory("all"); setActorId("all"); }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && filteredEvents.length === 0 && (
            <p className="text-xs text-muted-foreground py-4">
              {hasFilters ? "No matching activity" : "No activity yet"}
            </p>
          )}

          {!loading && filteredEvents.length > 0 && (
            <div className="relative">
              <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
              {Array.from(grouped.entries()).map(([dateLabel, dateEvents]) => (
                <div key={dateLabel}>
                  <div className="relative flex items-center py-1.5">
                    <div className="z-10 bg-background pr-2 pl-8">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {dateLabel}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {dateEvents.map((event) => (
                    <EventItem
                      key={event.id}
                      event={event}
                      showEntity
                      isCascadeChild={!!event.triggeredBy}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {!loading && allEvents.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-muted-foreground"
              onClick={fetchEvents}
            >
              Refresh
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
