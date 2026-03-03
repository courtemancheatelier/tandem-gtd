"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, ArrowRight } from "lucide-react";

interface AreasStepProps {
  onNext: (areaCount: number) => void;
  onSkip: () => void;
}

interface SuggestedArea {
  name: string;
  checked: boolean;
  editing: boolean;
}

const DEFAULT_AREAS: SuggestedArea[] = [
  { name: "Health & Fitness", checked: true, editing: false },
  { name: "Finances", checked: true, editing: false },
  { name: "Career / Work", checked: true, editing: false },
  { name: "Relationships", checked: true, editing: false },
  { name: "Home & Environment", checked: true, editing: false },
  { name: "Personal Growth", checked: false, editing: false },
  { name: "Creativity", checked: false, editing: false },
];

export function AreasStep({ onNext, onSkip }: AreasStepProps) {
  const [areas, setAreas] = useState<SuggestedArea[]>(DEFAULT_AREAS);
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  function toggleArea(index: number) {
    setAreas((prev) =>
      prev.map((a, i) => (i === index ? { ...a, checked: !a.checked } : a))
    );
  }

  function startEditing(index: number) {
    setAreas((prev) =>
      prev.map((a, i) => (i === index ? { ...a, editing: true } : a))
    );
  }

  function updateName(index: number, name: string) {
    setAreas((prev) =>
      prev.map((a, i) => (i === index ? { ...a, name } : a))
    );
  }

  function finishEditing(index: number) {
    setAreas((prev) =>
      prev.map((a, i) => (i === index ? { ...a, editing: false } : a))
    );
  }

  function handleAddArea() {
    if (!newName.trim()) return;
    setAreas((prev) => [
      ...prev,
      { name: newName.trim(), checked: true, editing: false },
    ]);
    setNewName("");
    setAdding(false);
  }

  async function handleContinue() {
    const checked = areas.filter((a) => a.checked);
    if (checked.length === 0) {
      onNext(0);
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(
        checked.map((area) =>
          fetch("/api/areas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: area.name }),
          })
        )
      );
      onNext(checked.length);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-8 md:py-12 px-6 md:px-10">
        <h2 className="text-2xl font-bold mb-2">Areas of Responsibility</h2>
        <p className="text-muted-foreground mb-6">
          Areas are the big parts of your life you maintain. They never
          &ldquo;complete&rdquo; — they&apos;re ongoing standards. Think: what
          would fall apart if you ignored it for 3 months?
        </p>

        <div className="space-y-2 mb-6">
          {areas.map((area, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50"
            >
              <Checkbox
                checked={area.checked}
                onCheckedChange={() => toggleArea(i)}
              />
              {area.editing ? (
                <Input
                  value={area.name}
                  onChange={(e) => updateName(i, e.target.value)}
                  onBlur={() => finishEditing(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishEditing(i);
                  }}
                  className="h-8"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => startEditing(i)}
                  className="text-sm font-medium text-left hover:underline"
                >
                  {area.name}
                </button>
              )}
            </div>
          ))}
        </div>

        {adding ? (
          <div className="flex items-center gap-2 mb-6">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Side Business"
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddArea();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <Button size="sm" onClick={handleAddArea}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="mb-6"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add area
          </Button>
        )}

        <p className="text-sm text-muted-foreground mb-6">
          Check the ones that matter to you. You can always adjust these later.
        </p>

        <div className="flex items-center justify-between">
          <Button onClick={handleContinue} disabled={submitting} size="lg">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating areas...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip this step
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
