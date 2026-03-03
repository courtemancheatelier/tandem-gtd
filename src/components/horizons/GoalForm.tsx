"use client";

import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface AreaOption {
  id: string;
  name: string;
}

export interface GoalFormData {
  title: string;
  description?: string;
  status: string;
  targetDate?: string | null;
  areaId?: string | null;
}

interface GoalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: GoalFormData) => Promise<void>;
  initialData?: GoalFormData | null;
  mode?: "create" | "edit";
}

export function GoalForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  mode = "create",
}: GoalFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("NOT_STARTED");
  const [targetDate, setTargetDate] = useState("");
  const [areaId, setAreaId] = useState<string>("__none__");
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setTitle(initialData.title);
        setDescription(initialData.description || "");
        setStatus(initialData.status);
        setTargetDate(
          initialData.targetDate
            ? new Date(initialData.targetDate).toISOString().split("T")[0]
            : ""
        );
        setAreaId(initialData.areaId || "__none__");
      } else {
        setTitle("");
        setDescription("");
        setStatus("NOT_STARTED");
        setTargetDate("");
        setAreaId("__none__");
      }
    }
  }, [open, initialData]);

  useEffect(() => {
    if (open) {
      fetch("/api/areas?active=true")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAreas(data))
        .catch(() => setAreas([]));
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        targetDate: targetDate
          ? new Date(targetDate).toISOString()
          : null,
        areaId: areaId === "__none__" ? null : areaId || null,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Goal" : "Edit Goal"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Define a 1-2 year goal for your 30,000ft horizon."
              : "Update the details of this goal."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Launch side project"
              maxLength={200}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="goal-description">Description</Label>
            <Textarea
              id="goal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does success look like?"
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="goal-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="goal-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="ACHIEVED">Achieved</SelectItem>
                  <SelectItem value="DEFERRED">Deferred</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="goal-target-date">Target Date</Label>
              <Input
                id="goal-target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="goal-area">Area of Responsibility</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger id="goal-area">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || submitting}>
              {submitting
                ? "Saving..."
                : mode === "create"
                ? "Create Goal"
                : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
