"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { RSVPConfirmation } from "./RSVPConfirmation";

interface EventField {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  sortOrder: number;
  options: { key: string; label: string }[] | null;
}

interface RSVPFormProps {
  token: string;
}

interface ClaimStatus {
  fieldId: string;
  optionKey: string;
  user: { id: string; name: string };
}

export function RSVPForm({ token }: RSVPFormProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<{
    id: string;
    title: string;
    description: string | null;
    eventDate: string;
    isLocked: boolean;
    fields: EventField[];
    projectTitle: string;
  } | null>(null);
  const [invitation, setInvitation] = useState<{
    email: string;
    role: string | null;
    status: string;
  } | null>(null);
  const [attendance, setAttendance] = useState<"YES" | "NO" | "MAYBE" | "">("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [claimStatuses, setClaimStatuses] = useState<ClaimStatus[]>([]);
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/rsvp/${token}`);
      if (!res.ok) {
        setError("Invalid or expired invitation link.");
        return;
      }
      const data = await res.json();
      setEvent(data.event);
      setInvitation(data.invitation);
    } catch {
      setError("Failed to load event.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Poll claim status for CLAIM fields
  const pollClaims = useCallback(async () => {
    if (!event) return;
    try {
      const res = await fetch(`/api/events/${event.id}/claims/status`);
      if (res.ok) {
        setClaimStatuses(await res.json());
      }
    } catch {
      // ignore
    }
  }, [event]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  useEffect(() => {
    if (!event) return;
    const hasClaimFields = event.fields.some((f) => f.type === "CLAIM");
    if (!hasClaimFields) return;

    pollClaims();

    // Poll every 8 seconds, pause when hidden
    const startPolling = () => {
      pollRef.current = setInterval(pollClaims, 8000);
    };
    const stopPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };

    startPolling();

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        pollClaims();
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [event, pollClaims]);

  function updateFieldValue(fieldId: string, value: unknown) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  function isOptionClaimed(fieldId: string, optionKey: string) {
    return claimStatuses.some(
      (c) => c.fieldId === fieldId && c.optionKey === optionKey
    );
  }

  async function handleSubmit() {
    if (!attendance) {
      toast({ title: "Please select your attendance", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/rsvp/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendance, fieldValues }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit RSVP");
      }
      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to submit",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">{error || "Event not found."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return <RSVPConfirmation event={event} attendance={attendance as "YES" | "NO" | "MAYBE"} />;
  }

  if (event.isLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">This event is no longer accepting responses.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {event.projectTitle}
          </div>
          <CardTitle>{event.title}</CardTitle>
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}
          <p className="text-sm">
            {new Date(event.eventDate).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {invitation?.email && (
            <p className="text-xs text-muted-foreground">
              Responding as {invitation.email}
              {invitation.role && ` (${invitation.role})`}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Attendance */}
          <div className="space-y-2">
            <Label>Will you attend? *</Label>
            <div className="flex gap-2">
              {(["YES", "NO", "MAYBE"] as const).map((option) => (
                <Button
                  key={option}
                  variant={attendance === option ? "default" : "outline"}
                  onClick={() => setAttendance(option)}
                  className="flex-1"
                >
                  {option === "YES" ? "Yes" : option === "NO" ? "No" : "Maybe"}
                </Button>
              ))}
            </div>
          </div>

          {/* Dynamic Fields */}
          {event.fields.map((field) => {
            if (field.type === "ATTENDANCE") return null; // handled above

            return (
              <div key={field.id} className="space-y-2">
                <Label>
                  {field.label}
                  {field.isRequired && " *"}
                </Label>

                {field.type === "TEXT" && (
                  <Textarea
                    value={(fieldValues[field.id] as string) || ""}
                    onChange={(e) => updateFieldValue(field.id, e.target.value)}
                    rows={2}
                  />
                )}

                {field.type === "HEADCOUNT" && (
                  <Input
                    type="number"
                    min={0}
                    value={(fieldValues[field.id] as number) ?? ""}
                    onChange={(e) => updateFieldValue(field.id, parseInt(e.target.value) || 0)}
                  />
                )}

                {field.type === "TOGGLE" && (
                  <div className="flex gap-2">
                    <Button
                      variant={fieldValues[field.id] === true ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateFieldValue(field.id, true)}
                    >
                      Yes
                    </Button>
                    <Button
                      variant={fieldValues[field.id] === false ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateFieldValue(field.id, false)}
                    >
                      No
                    </Button>
                  </div>
                )}

                {(field.type === "SINGLE_SELECT" || field.type === "CLAIM") && field.options && (
                  <div className="flex flex-wrap gap-2">
                    {(field.options as { key: string; label: string }[]).map((opt) => {
                      const claimed = field.type === "CLAIM" && isOptionClaimed(field.id, opt.key);
                      const selected = fieldValues[field.id] === opt.key;
                      return (
                        <Button
                          key={opt.key}
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          disabled={claimed && !selected}
                          onClick={() => updateFieldValue(field.id, selected ? undefined : opt.key)}
                        >
                          {opt.label}
                          {claimed && !selected && " (taken)"}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {field.type === "MULTI_SELECT" && field.options && (
                  <div className="flex flex-wrap gap-2">
                    {(field.options as { key: string; label: string }[]).map((opt) => {
                      const selected = Array.isArray(fieldValues[field.id]) &&
                        (fieldValues[field.id] as string[]).includes(opt.key);
                      return (
                        <Button
                          key={opt.key}
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = (fieldValues[field.id] as string[]) || [];
                            if (selected) {
                              updateFieldValue(field.id, current.filter((k) => k !== opt.key));
                            } else {
                              updateFieldValue(field.id, [...current, opt.key]);
                            }
                          }}
                        >
                          {opt.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || !attendance}
            className="w-full"
          >
            {submitting ? "Submitting..." : "Submit RSVP"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
