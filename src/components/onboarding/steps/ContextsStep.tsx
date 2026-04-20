"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, ArrowRight } from "lucide-react";

interface ContextsStepProps {
  onNext: (contextCount: number) => void;
  onSkip: () => void;
}

interface ContextData {
  id: string;
  name: string;
  color: string | null;
  checked: boolean;
  editing: boolean;
}

export function ContextsStep({ onNext, onSkip }: ContextsStepProps) {
  const [contexts, setContexts] = useState<ContextData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const fetchContexts = useCallback(async () => {
    try {
      const res = await fetch("/api/contexts");
      if (res.ok) {
        const data = await res.json();
        setContexts(
          data.map((c: { id: string; name: string; color: string | null }) => ({
            ...c,
            checked: true,
            editing: false,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  function toggleContext(id: string) {
    setContexts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c))
    );
  }

  function startEditing(id: string) {
    setContexts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, editing: true } : c))
    );
  }

  function updateName(id: string, name: string) {
    setContexts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    );
  }

  async function finishEditing(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;
    setContexts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, editing: false } : c))
    );
    // Save rename
    await fetch(`/api/contexts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ctx.name }),
    });
  }

  async function handleAddContext() {
    if (!newName.trim()) return;
    const res = await fetch("/api/contexts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setContexts((prev) => [
        ...prev,
        { ...created, checked: true, editing: false },
      ]);
      setNewName("");
      setAdding(false);
    }
  }

  async function handleContinue() {
    setSubmitting(true);
    try {
      // Delete unchecked contexts
      const unchecked = contexts.filter((c) => !c.checked);
      await Promise.all(
        unchecked.map((c) =>
          fetch(`/api/contexts/${c.id}`, { method: "DELETE" })
        )
      );
      const remaining = contexts.filter((c) => c.checked).length;
      onNext(remaining);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-8 md:py-12 px-6 md:px-10">
        <h2 className="text-2xl font-bold mb-2">Your Contexts</h2>
        <p className="text-muted-foreground mb-6">
          Contexts are where you can do work. When you&apos;re at the office,
          you see @Office tasks. When you&apos;re running errands, you see
          @Errands tasks.
        </p>

        <div className="space-y-2 mb-6">
          {contexts.map((ctx) => (
            <div
              key={ctx.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50"
            >
              <Checkbox
                checked={ctx.checked}
                onCheckedChange={() => toggleContext(ctx.id)}
              />
              {ctx.editing ? (
                <Input
                  value={ctx.name}
                  onChange={(e) => updateName(ctx.id, e.target.value)}
                  onBlur={() => finishEditing(ctx.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishEditing(ctx.id);
                  }}
                  className="h-8"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => startEditing(ctx.id)}
                  className="text-sm font-medium text-left hover:underline"
                >
                  {ctx.name}
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
              placeholder="@NewContext"
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddContext();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <Button size="sm" onClick={handleAddContext}>
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
            Add context
          </Button>
        )}

        <p className="text-sm text-muted-foreground mb-6">
          These work for most people. You can always change them later.
          Unchecked contexts will be removed.
        </p>

        <div className="flex items-center justify-between">
          <Button onClick={handleContinue} disabled={submitting} size="lg">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
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
