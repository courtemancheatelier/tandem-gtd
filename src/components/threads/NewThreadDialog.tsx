"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MentionPicker } from "./MentionPicker";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  AlertTriangle,
  ArrowUpRight,
  Info,
} from "lucide-react";

const PURPOSE_OPTIONS = [
  { value: "QUESTION", label: "Question", icon: HelpCircle, color: "text-blue-500" },
  { value: "BLOCKER", label: "Blocker", icon: AlertTriangle, color: "text-red-500" },
  { value: "UPDATE", label: "Update", icon: ArrowUpRight, color: "text-green-500" },
  { value: "FYI", label: "FYI", icon: Info, color: "text-muted-foreground" },
] as const;

interface NewThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    purpose: string;
    title: string;
    message: string;
    mentions: string[];
    setTaskWaiting?: boolean;
  }) => void;
  members: { id: string; name: string }[];
  currentUserId: string;
  anchorType: "task" | "project";
}

export function NewThreadDialog({
  open,
  onOpenChange,
  onSubmit,
  members,
  currentUserId,
  anchorType,
}: NewThreadDialogProps) {
  const [purpose, setPurpose] = useState<string>("QUESTION");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [setTaskWaiting, setSetTaskWaiting] = useState(false);

  function handleSubmit() {
    if (!title.trim() || !message.trim()) return;
    onSubmit({
      purpose,
      title: title.trim(),
      message: message.trim(),
      mentions,
      setTaskWaiting: purpose === "BLOCKER" && anchorType === "task" ? setTaskWaiting : undefined,
    });
    // Reset
    setPurpose("QUESTION");
    setTitle("");
    setMessage("");
    setMentions([]);
    setSetTaskWaiting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Thread</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Purpose selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Purpose
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PURPOSE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPurpose(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors",
                      purpose === opt.value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", opt.color)} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary..."
              className="text-sm"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Message
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Mentions */}
          <MentionPicker
            members={members}
            selected={mentions}
            onChange={setMentions}
            currentUserId={currentUserId}
          />

          {/* Set task waiting (BLOCKER only) */}
          {purpose === "BLOCKER" && anchorType === "task" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={setTaskWaiting}
                onCheckedChange={(v) => setSetTaskWaiting(!!v)}
              />
              <span className="text-sm">Set task to Waiting</span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || !message.trim()}>
            Create Thread
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
