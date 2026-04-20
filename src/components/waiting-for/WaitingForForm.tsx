"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface WaitingForFormData {
  description: string;
  person: string;
  dueDate: string;
  followUpDate: string;
}

interface WaitingForFormProps {
  initialData?: {
    description?: string;
    person?: string;
    dueDate?: string | null;
    followUpDate?: string | null;
  };
  onSubmit: (data: {
    description: string;
    person: string;
    dueDate: string | null;
    followUpDate: string | null;
  }) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

function toDateInputValue(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toISOString().split("T")[0];
}

export function WaitingForForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Create",
}: WaitingForFormProps) {
  const [form, setForm] = useState<WaitingForFormData>({
    description: initialData?.description ?? "",
    person: initialData?.person ?? "",
    dueDate: toDateInputValue(initialData?.dueDate),
    followUpDate: toDateInputValue(initialData?.followUpDate),
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || !form.person.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        description: form.description.trim(),
        person: form.person.trim(),
        dueDate: form.dueDate
          ? new Date(form.dueDate + "T00:00:00.000Z").toISOString()
          : null,
        followUpDate: form.followUpDate
          ? new Date(form.followUpDate + "T00:00:00.000Z").toISOString()
          : null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="wf-person">Person</Label>
        <Input
          id="wf-person"
          value={form.person}
          onChange={(e) => setForm({ ...form, person: e.target.value })}
          placeholder="Who are you waiting on?"
          maxLength={100}
        />
      </div>
      <div>
        <Label htmlFor="wf-description">Description</Label>
        <Textarea
          id="wf-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What are you waiting for?"
          rows={3}
          maxLength={500}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wf-due">Due Date</Label>
          <Input
            id="wf-due"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wf-followup">Follow-Up Date</Label>
          <Input
            id="wf-followup"
            type="date"
            value={form.followUpDate}
            onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!form.description.trim() || !form.person.trim() || submitting}
        >
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
