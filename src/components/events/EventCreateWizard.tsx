"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check } from "lucide-react";

interface EventField {
  type: string;
  label: string;
  isRequired: boolean;
  options?: { key: string; label: string }[];
}

interface EventCreateWizardProps {
  projectId: string;
  onCreated: (eventId: string) => void;
  onCancel: () => void;
}

const FIELD_TYPES = [
  { value: "ATTENDANCE", label: "Attendance (Yes/No/Maybe)" },
  { value: "HEADCOUNT", label: "Headcount (number)" },
  { value: "SINGLE_SELECT", label: "Single Select" },
  { value: "MULTI_SELECT", label: "Multi Select" },
  { value: "CLAIM", label: "Claim (bring list)" },
  { value: "TEXT", label: "Text" },
  { value: "TOGGLE", label: "Toggle (yes/no)" },
];

const NEEDS_OPTIONS = ["SINGLE_SELECT", "MULTI_SELECT", "CLAIM"];

export function EventCreateWizard({ projectId, onCreated, onCancel }: EventCreateWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Step 0: Basic info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [lockDate, setLockDate] = useState("");

  // Step 1: Fields
  const [fields, setFields] = useState<EventField[]>([
    { type: "ATTENDANCE", label: "Will you attend?", isRequired: true },
  ]);

  // Step 2: Guest emails
  const [guestEmails, setGuestEmails] = useState("");

  const steps = ["Event Details", "Response Fields", "Guest List", "Review"];

  function addField() {
    setFields([...fields, { type: "TEXT", label: "", isRequired: false }]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<EventField>) {
    setFields(fields.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, ...updates };
      // Initialize options when switching to a type that needs them
      if (updates.type && NEEDS_OPTIONS.includes(updates.type) && !updated.options?.length) {
        updated.options = [{ key: "option_1", label: "" }];
      }
      // Clear options when switching away
      if (updates.type && !NEEDS_OPTIONS.includes(updates.type)) {
        updated.options = undefined;
      }
      return updated;
    }));
  }

  function addOption(fieldIndex: number) {
    const field = fields[fieldIndex];
    const opts = field.options || [];
    const key = `option_${opts.length + 1}`;
    updateField(fieldIndex, { options: [...opts, { key, label: "" }] });
  }

  function removeOption(fieldIndex: number, optIndex: number) {
    const field = fields[fieldIndex];
    const opts = (field.options || []).filter((_, i) => i !== optIndex);
    updateField(fieldIndex, { options: opts });
  }

  function updateOption(fieldIndex: number, optIndex: number, label: string) {
    const field = fields[fieldIndex];
    const opts = (field.options || []).map((o, i) =>
      i === optIndex ? { ...o, label, key: label.toLowerCase().replace(/\s+/g, "_") || o.key } : o
    );
    updateField(fieldIndex, { options: opts });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      // 1. Create event
      const eventRes = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          eventDate: new Date(eventDate).toISOString(),
          lockDate: lockDate ? new Date(lockDate).toISOString() : undefined,
          projectId,
        }),
      });
      if (!eventRes.ok) {
        const err = await eventRes.json();
        throw new Error(err.error || "Failed to create event");
      }
      const event = await eventRes.json();

      // 2. Add fields
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (!f.label.trim()) continue;
        await fetch(`/api/events/${event.id}/fields`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: f.type,
            label: f.label,
            isRequired: f.isRequired,
            sortOrder: i,
            options: f.options,
          }),
        });
      }

      // 3. Invite guests
      const emails = guestEmails
        .split(/[,\n]/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));
      if (emails.length > 0) {
        await fetch(`/api/events/${event.id}/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails }),
        });
      }

      toast({ title: "Event created", description: `${title} is ready for RSVPs.` });
      onCreated(event.id);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create event",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const canProceed = step === 0 ? title.trim() && eventDate : true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Create Event — {steps[step]}</span>
          <span className="text-sm font-normal text-muted-foreground">
            Step {step + 1} of {steps.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="event-title">Event Title *</Label>
              <Input
                id="event-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Team BBQ, Sprint Retro, etc."
              />
            </div>
            <div>
              <Label htmlFor="event-desc">Description</Label>
              <Textarea
                id="event-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="event-date">Event Date *</Label>
                <Input
                  id="event-date"
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lock-date">Lock Date (optional)</Label>
                <Input
                  id="lock-date"
                  type="datetime-local"
                  value={lockDate}
                  onChange={(e) => setLockDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Fields */}
        {step === 1 && (
          <div className="space-y-3">
            {fields.map((field, i) => (
              <div key={i} className="rounded border p-3 space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <div className="w-48">
                        <Label>Type</Label>
                        <Select value={field.type} onValueChange={(v) => updateField(i, { type: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((ft) => (
                              <SelectItem key={ft.value} value={ft.value}>
                                {ft.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label>Label</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(i, { label: e.target.value })}
                          placeholder="Question or field label"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeField(i)}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {NEEDS_OPTIONS.includes(field.type) && (
                  <div className="space-y-1.5 border-t pt-3">
                    <Label className="text-xs text-muted-foreground">
                      {field.type === "CLAIM" ? "Items to claim" : "Options"}
                    </Label>
                    {(field.options || []).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-1.5">
                        <Input
                          value={opt.label}
                          onChange={(e) => updateOption(i, oi, e.target.value)}
                          placeholder={field.type === "CLAIM" ? `Item ${oi + 1} (e.g. "Rolls (2 dozen)")` : `Option ${oi + 1}`}
                          className="h-8 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => removeOption(i, oi)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addOption(i)}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add {field.type === "CLAIM" ? "item" : "option"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={addField} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add Field
            </Button>
          </div>
        )}

        {/* Step 2: Guest List */}
        {step === 2 && (
          <div className="space-y-2">
            <Label htmlFor="guest-emails">
              Guest Emails (comma or newline separated)
            </Label>
            <Textarea
              id="guest-emails"
              value={guestEmails}
              onChange={(e) => setGuestEmails(e.target.value)}
              placeholder={"alice@example.com\nbob@example.com"}
              rows={6}
            />
            <p className="text-sm text-muted-foreground">
              Each guest will receive a unique RSVP link.
            </p>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium">Title:</span> {title}
            </div>
            <div>
              <span className="text-sm font-medium">Date:</span>{" "}
              {eventDate ? new Date(eventDate).toLocaleString() : "—"}
            </div>
            {description && (
              <div>
                <span className="text-sm font-medium">Description:</span> {description}
              </div>
            )}
            <div>
              <span className="text-sm font-medium">Fields:</span> {fields.filter((f) => f.label.trim()).length}
            </div>
            <div>
              <span className="text-sm font-medium">Guests:</span>{" "}
              {guestEmails.split(/[,\n]/).filter((e) => e.trim().includes("@")).length}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            ) : (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
          <div>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving || !title.trim() || !eventDate}>
                {saving ? "Creating..." : (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Create Event
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
