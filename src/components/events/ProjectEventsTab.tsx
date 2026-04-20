"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { EventCreateWizard } from "./EventCreateWizard";
import { EventDashboard } from "./EventDashboard";
import { CalendarPlus } from "lucide-react";

interface ProjectEventsTabProps {
  projectId: string;
  currentUserId: string;
}

export function ProjectEventsTab({ projectId, currentUserId }: ProjectEventsTabProps) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [hasEvent, setHasEvent] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);

  const checkEvent = useCallback(async () => {
    // We don't have a direct "get event by project" endpoint,
    // but the project detail includes the event relation.
    // For now, fetch events via the project and check.
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const project = await res.json();
      if (project.rsvpEvent) {
        setEventId(project.rsvpEvent.id);
        setHasEvent(true);
      } else {
        setHasEvent(false);
      }
    } catch {
      setHasEvent(false);
    }
  }, [projectId]);

  useEffect(() => {
    checkEvent();
  }, [checkEvent]);

  if (hasEvent === null) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (creating) {
    return (
      <EventCreateWizard
        projectId={projectId}
        onCreated={(id) => {
          setEventId(id);
          setHasEvent(true);
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (hasEvent && eventId) {
    return <EventDashboard eventId={eventId} currentUserId={currentUserId} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CalendarPlus className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-medium">No event yet</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Create an event to collect RSVPs and coordinate logistics.
      </p>
      <Button onClick={() => setCreating(true)}>
        <CalendarPlus className="mr-2 h-4 w-4" /> Create Event
      </Button>
    </div>
  );
}
