"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OptionData = any;

interface ResolutionFormProps {
  options: OptionData[];
  onResolve: (outcome: string, rationale?: string, chosenOptionId?: string) => void;
  onCancel: () => void;
}

export function ResolutionForm({ options, onResolve, onCancel }: ResolutionFormProps) {
  const [outcome, setOutcome] = useState("");
  const [rationale, setRationale] = useState("");
  const [chosenOptionId, setChosenOptionId] = useState<string | undefined>();

  return (
    <Card className="border-primary/30">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-primary" />
          Record Decision
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        {options.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Chosen Option</label>
            <div className="flex flex-wrap gap-2">
              {options.map((opt: OptionData) => (
                <Button
                  key={opt.id}
                  size="sm"
                  variant={chosenOptionId === opt.id ? "default" : "outline"}
                  onClick={() => setChosenOptionId(opt.id)}
                  className="text-xs"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Outcome <span className="text-destructive">*</span>
          </label>
          <Textarea
            placeholder="What was decided?"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Rationale</label>
          <Textarea
            placeholder="Why was this decided? (optional)"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!outcome.trim()} onClick={() => onResolve(outcome, rationale || undefined, chosenOptionId)}>
            Record Decision
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
