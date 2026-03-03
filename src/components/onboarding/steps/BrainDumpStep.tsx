"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight } from "lucide-react";

interface BrainDumpStepProps {
  onNext: (items: string[]) => void;
  onSkip: () => void;
}

export function BrainDumpStep({ onNext, onSkip }: BrainDumpStepProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const itemCount = lines.length;

  async function handleSubmit() {
    if (lines.length === 0) return;
    setSubmitting(true);

    try {
      await Promise.all(
        lines.map((content) =>
          fetch("/api/inbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          })
        )
      );
      onNext(lines);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-8 md:py-12 px-6 md:px-10">
        <h2 className="text-2xl font-bold mb-2">What&apos;s on your mind?</h2>
        <p className="text-muted-foreground mb-6">
          Don&apos;t filter. Don&apos;t organize. Just get it out of your head.
          Things to do, ideas, errands, projects, worries — anything. One item
          per line.
        </p>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Buy groceries\nFix the leaky faucet\nPlan birthday party for Mom\nResearch vacation destinations\nSchedule dentist appointment"}
          className="min-h-[200px] mb-4 font-mono text-sm"
          autoFocus
          disabled={submitting}
        />

        <p className="text-sm text-muted-foreground mb-6">
          {itemCount} item{itemCount !== 1 ? "s" : ""} captured
        </p>

        <div className="flex items-center justify-between">
          <Button
            onClick={handleSubmit}
            disabled={itemCount === 0 || submitting}
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding to Inbox...
              </>
            ) : (
              <>
                Add These to Inbox
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
