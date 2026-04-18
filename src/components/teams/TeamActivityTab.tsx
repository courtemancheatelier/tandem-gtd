"use client";

import { useEffect, useState, useCallback } from "react";
import { EventItem, type EventItemData } from "@/components/history/EventItem";
import { groupEventsByDate } from "@/lib/history/format";
import { Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Actor {
  id: string;
  name: string;
}

interface ProjectRef {
  id: string;
  title: string;
}

interface TeamActivityTabProps {
  teamId: string;
}

const CATEGORIES = [
  { value: "all", label: "All activity" },
  { value: "threads", label: "Threads" },
  { value: "decisions", label: "Decisions" },
  { value: "tasks", label: "Tasks" },
  { value: "projects", label: "Projects" },
];

export function TeamActivityTab({ teamId }: TeamActivityTabProps) {
  const [events, setEvents] = useState<EventItemData[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [projectId, setProjectId] = useState("all");

  const fetchEvents = useCallback(async (append = false, before?: string) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (category !== "all") params.set("category", category);
      if (actorId !== "all") params.set("actorId", actorId);
      if (projectId !== "all") params.set("projectId", projectId);
      if (before) params.set("before", before);

      const res = await fetch(`/api/teams/${teamId}/activity?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      if (append) {
        setEvents((prev) => [...prev, ...data.events]);
      } else {
        setEvents(data.events);
        // Only update actors/projects on initial load (not filtered loads) to keep the full list
        if (data.actors?.length > 0 && actors.length === 0) {
          setActors(data.actors);
        }
        if (data.projects?.length > 0 && projects.length === 0) {
          setProjects(data.projects);
        }
      }
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [teamId, category, actorId, projectId, actors.length, projects.length]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function loadMore() {
    if (events.length === 0) return;
    const oldest = events[events.length - 1].createdAt;
    fetchEvents(true, oldest);
  }

  const grouped = groupEventsByDate(events);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={category} onValueChange={(v) => setCategory(v)}>
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
        {projects.length > 1 && (
          <Select value={projectId} onValueChange={(v) => setProjectId(v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {actors.length > 0 && (
          <Select value={actorId} onValueChange={(v) => setActorId(v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="All people" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All people</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(category !== "all" || actorId !== "all" || projectId !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { setCategory("all"); setActorId("all"); setProjectId("all"); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Events */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && events.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          No activity{category !== "all" ? ` for "${CATEGORIES.find(c => c.value === category)?.label}"` : ""}.
        </p>
      )}

      {!loading && events.length > 0 && (
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

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Loading...</>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
