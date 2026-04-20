"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, MessageCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const VOTE_OPTIONS = [
  { value: "APPROVE", label: "Approve", icon: ThumbsUp, color: "text-green-500 hover:bg-green-50" },
  { value: "REJECT", label: "Reject", icon: ThumbsDown, color: "text-red-500 hover:bg-red-50" },
  { value: "COMMENT", label: "Comment", icon: MessageCircle, color: "text-blue-500 hover:bg-blue-50" },
  { value: "DEFER", label: "Defer", icon: Clock, color: "text-muted-foreground hover:bg-muted" },
] as const;

interface DecisionResponseFormProps {
  onSubmit: (vote: string, comment?: string) => void;
  existingVote?: string;
  existingComment?: string;
}

export function DecisionResponseForm({ onSubmit, existingVote, existingComment }: DecisionResponseFormProps) {
  const [selectedVote, setSelectedVote] = useState<string>(existingVote || "");
  const [comment, setComment] = useState(existingComment || "");

  function handleSubmit() {
    if (!selectedVote) return;
    onSubmit(selectedVote, comment.trim() || undefined);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {VOTE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedVote(opt.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors",
                selectedVote === opt.value ? "border-primary bg-primary/5" : opt.color
              )}
            >
              <Icon className="h-4 w-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)..."
        rows={2}
        className="text-sm"
      />

      <Button size="sm" onClick={handleSubmit} disabled={!selectedVote}>
        {existingVote ? "Update Response" : "Submit Response"}
      </Button>
    </div>
  );
}
