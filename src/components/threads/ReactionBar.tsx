"use client";

import { cn } from "@/lib/utils";
import { ReactionPicker } from "./ReactionPicker";

export interface ReactionData {
  emoji: string;
  count: number;
  users: { id: string; name: string }[];
  reacted: boolean; // whether the current user has reacted with this emoji
}

interface ReactionBarProps {
  reactions: ReactionData[];
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, onToggle }: ReactionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          title={r.users.map((u) => u.name).join(", ")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors border",
            r.reacted
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
          )}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
      <ReactionPicker onSelect={onToggle} />
    </div>
  );
}
