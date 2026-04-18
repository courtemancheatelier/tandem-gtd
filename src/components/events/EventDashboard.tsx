"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Download, Lock, Unlock, Users, Check, X, HelpCircle, Trash2, Pencil, Plus, Link, Copy } from "lucide-react";

interface EventField {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  isOrgOnly: boolean;
  sortOrder: number;
  options: { key: string; label: string }[] | null;
}

interface EventInvitation {
  id: string;
  email: string;
  role: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
}

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  lockDate: string | null;
  isLocked: boolean;
  fields: EventField[];
  invitations: EventInvitation[];
  _count: { invitations: number; responses: number };
  project: { id: string; title: string; userId: string };
}

interface EventResponse {
  id: string;
  attendance: "YES" | "NO" | "MAYBE";
  fieldValues: Record<string, unknown>;
  submittedAt: string;
  user: { id: string; name: string; email: string };
}

interface EventDashboardProps {
  eventId: string;
  currentUserId: string;
}

export function EventDashboard({ eventId, currentUserId }: EventDashboardProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [responses, setResponses] = useState<EventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editLockDate, setEditLockDate] = useState("");
  const [editFields, setEditFields] = useState<EventField[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [newGuestRole, setNewGuestRole] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [eventRes, responsesRes] = await Promise.all([
        fetch(`/api/events/${eventId}`),
        fetch(`/api/events/${eventId}/responses`),
      ]);
      if (eventRes.ok) setEvent(await eventRes.json());
      if (responsesRes.ok) setResponses(await responsesRes.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function toggleLock() {
    if (!event) return;
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLocked: !event.isLocked }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvent(updated);
      toast({
        title: updated.isLocked ? "Event locked" : "Event unlocked",
        description: updated.isLocked
          ? "No more responses will be accepted."
          : "Responses are now open.",
      });
    }
  }

  async function handleExport() {
    const res = await fetch(`/api/events/${eventId}/responses/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "event-responses.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Event deleted" });
      // Reload page to show no-event state
      window.location.reload();
    }
  }

  function startEditing() {
    if (!event) return;
    setEditTitle(event.title);
    setEditDescription(event.description || "");
    const d = new Date(event.eventDate);
    setEditEventDate(d.toISOString().slice(0, 16));
    if (event.lockDate) {
      const ld = new Date(event.lockDate);
      setEditLockDate(ld.toISOString().slice(0, 16));
    } else {
      setEditLockDate("");
    }
    setEditFields([...event.fields]);
    setEditing(true);
  }

  async function saveEdits() {
    if (!event) return;
    setSavingEdit(true);
    try {
      // Update event details
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          eventDate: new Date(editEventDate).toISOString(),
          lockDate: editLockDate ? new Date(editLockDate).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update event");

      // Update each field
      for (const field of editFields) {
        await fetch(`/api/events/${eventId}/fields/${field.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: field.label,
            isRequired: field.isRequired,
            options: field.options,
          }),
        });
      }

      toast({ title: "Event updated" });
      setEditing(false);
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  function updateEditField(index: number, updates: Partial<EventField>) {
    setEditFields(editFields.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  }

  async function addGuest() {
    if (!newGuestEmail.trim().includes("@")) return;
    setAddingGuest(true);
    try {
      const res = await fetch(`/api/events/${eventId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: [newGuestEmail.trim()],
          role: newGuestRole.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to invite guest");
      toast({ title: "Guest invited", description: newGuestEmail.trim() });
      setNewGuestEmail("");
      setNewGuestRole("");
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to invite guest", variant: "destructive" });
    } finally {
      setAddingGuest(false);
    }
  }

  async function removeGuest(invitationId: string) {
    const res = await fetch(`/api/events/${eventId}/invitations/${invitationId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast({ title: "Guest removed" });
      fetchData();
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading event...</div>;
  }

  if (!event) {
    return <div className="py-8 text-center text-muted-foreground">Event not found.</div>;
  }

  const yesCount = responses.filter((r) => r.attendance === "YES").length;
  const noCount = responses.filter((r) => r.attendance === "NO").length;
  const maybeCount = responses.filter((r) => r.attendance === "MAYBE").length;
  const total = responses.length;
  const isOwner = event.project.userId === currentUserId;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{event.title}</h3>
          {event.description && (
            <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
          )}
          <p className="mt-1 text-sm">
            {new Date(event.eventDate).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={toggleLock}>
              {event.isLocked ? (
                <><Unlock className="mr-1 h-4 w-4" /> Unlock</>
              ) : (
                <><Lock className="mr-1 h-4 w-4" /> Lock</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1 h-4 w-4" /> Export
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Shareable RSVP Link */}
      {isOwner && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-sm">
              {typeof window !== "undefined"
                ? `${window.location.origin}/rsvp/${event.id}`
                : `/rsvp/${event.id}`}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/rsvp/${event.id}`;
                navigator.clipboard.writeText(url);
                toast({ title: "Link copied", description: "Share this with your guests." });
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit Panel */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Edit Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Event Date</Label>
                <Input type="datetime-local" value={editEventDate} onChange={(e) => setEditEventDate(e.target.value)} />
              </div>
              <div>
                <Label>Lock Date</Label>
                <Input type="datetime-local" value={editLockDate} onChange={(e) => setEditLockDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Response Fields</Label>
              {editFields.map((field, i) => (
                <div key={field.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs shrink-0">{field.type}</Badge>
                    <Input
                      value={field.label}
                      onChange={(e) => updateEditField(i, { label: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  {field.options && field.options.length > 0 && (
                    <div className="ml-4 space-y-1">
                      <span className="text-xs text-muted-foreground">Options:</span>
                      {field.options.map((opt, oi) => (
                        <Input
                          key={oi}
                          value={opt.label}
                          onChange={(e) => {
                            const opts = [...(field.options || [])];
                            opts[oi] = { ...opts[oi], label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, "_") || opts[oi].key };
                            updateEditField(i, { options: opts });
                          }}
                          className="h-7 text-xs"
                        />
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          const opts = [...(field.options || [])];
                          opts.push({ key: `option_${opts.length + 1}`, label: "" });
                          updateEditField(i, { options: opts });
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add option
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={saveEdits} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Summary */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{event._count.invitations}</span>
            </div>
            <p className="text-xs text-muted-foreground">Invited</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-2xl font-bold">{yesCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Attending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <X className="h-4 w-4 text-red-500" />
              <span className="text-2xl font-bold">{noCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Declined</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <HelpCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{maybeCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Maybe</p>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Bar */}
      {total > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {yesCount > 0 && (
            <div className="bg-green-500" style={{ width: `${(yesCount / total) * 100}%` }} />
          )}
          {maybeCount > 0 && (
            <div className="bg-yellow-400" style={{ width: `${(maybeCount / total) * 100}%` }} />
          )}
          {noCount > 0 && (
            <div className="bg-red-400" style={{ width: `${(noCount / total) * 100}%` }} />
          )}
        </div>
      )}

      {/* Guest List */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Guest List ({event.invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {event.invitations.length > 0 && (
              <div className="space-y-1.5">
                {event.invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span>{inv.email}</span>
                      {inv.role && (
                        <Badge variant="secondary" className="text-xs">{inv.role}</Badge>
                      )}
                      <Badge
                        variant={inv.status === "ACCEPTED" ? "default" : inv.status === "DECLINED" ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {inv.status.toLowerCase()}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeGuest(inv.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 border-t pt-3">
              <div className="flex-1">
                <Label className="text-xs">Email</Label>
                <Input
                  value={newGuestEmail}
                  onChange={(e) => setNewGuestEmail(e.target.value)}
                  placeholder="guest@example.com"
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addGuest()}
                />
              </div>
              <div className="w-32">
                <Label className="text-xs">Role (optional)</Label>
                <Input
                  value={newGuestRole}
                  onChange={(e) => setNewGuestRole(e.target.value)}
                  placeholder="e.g. Bridesmaid"
                  className="h-8 text-sm"
                />
              </div>
              <Button size="sm" className="h-8" onClick={addGuest} disabled={addingGuest}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Response Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Responses ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">No responses yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Attendance</th>
                    {event.fields.map((f) => (
                      <th key={f.id} className="pb-2 pr-4 font-medium">{f.label}</th>
                    ))}
                    <th className="pb-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.user.name}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            r.attendance === "YES"
                              ? "default"
                              : r.attendance === "NO"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {r.attendance}
                        </Badge>
                      </td>
                      {event.fields.map((f) => (
                        <td key={f.id} className="py-2 pr-4">
                          {String(r.fieldValues[f.id] ?? "—")}
                        </td>
                      ))}
                      <td className="py-2">
                        {new Date(r.submittedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
