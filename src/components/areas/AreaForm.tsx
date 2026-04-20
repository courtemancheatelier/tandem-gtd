"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AreaFormProps {
  initialName?: string;
  initialDescription?: string;
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function AreaForm({
  initialName = "",
  initialDescription = "",
  onSubmit,
  onCancel,
  submitLabel = "Create Area",
}: AreaFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="area-name">Name</Label>
        <Input
          id="area-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Health & Fitness"
          maxLength={100}
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="area-description">Description</Label>
        <Textarea
          id="area-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What standards do you want to maintain in this area?"
          rows={3}
          maxLength={2000}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
