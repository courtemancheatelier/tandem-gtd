"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  User,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WaitingForForm } from "./WaitingForForm";

export interface WaitingForItem {
  id: string;
  description: string;
  person: string;
  dueDate: string | null;
  followUpDate: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WaitingForCardProps {
  item: WaitingForItem;
  urgency: "needs-follow-up" | "upcoming" | "open" | "resolved";
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  onUpdate: (
    id: string,
    data: {
      description: string;
      person: string;
      dueDate: string | null;
      followUpDate: string | null;
    }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

function daysWaiting(createdAt: string): number {
  return Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 86400000
  );
}

export function WaitingForCard({
  item,
  urgency,
  onResolve,
  onUpdate,
  onDelete,
}: WaitingForCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const days = daysWaiting(item.createdAt);

  const borderClass =
    urgency === "needs-follow-up"
      ? "border-amber-400 dark:border-amber-600"
      : urgency === "resolved"
        ? "border-muted opacity-60"
        : "";

  async function handleResolve() {
    setResolving(true);
    try {
      await onResolve(item.id, !item.isResolved);
    } finally {
      setResolving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdate(data: {
    description: string;
    person: string;
    dueDate: string | null;
    followUpDate: string | null;
  }) {
    await onUpdate(item.id, data);
    setExpanded(false);
  }

  return (
    <Card className={cn("transition-colors", borderClass)}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-sm font-medium",
                  item.isResolved && "line-through text-muted-foreground"
                )}
              >
                {item.description}
              </span>
              <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                <User className="h-3 w-3" />
                {item.person}
              </Badge>
            </div>

            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {item.dueDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due {formatDate(item.dueDate)}
                </span>
              )}
              {item.followUpDate && (
                <span
                  className={cn(
                    "text-xs flex items-center gap-1",
                    urgency === "needs-follow-up"
                      ? "text-amber-600 dark:text-amber-400 font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  Follow up {formatDate(item.followUpDate)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {days === 0
                  ? "Today"
                  : days === 1
                    ? "1 day waiting"
                    : `${days} days waiting`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant={item.isResolved ? "outline" : "ghost"}
              onClick={handleResolve}
              disabled={resolving}
              title={item.isResolved ? "Unresolve" : "Mark as resolved"}
              className="h-8 w-8 p-0"
            >
              {item.isResolved ? (
                <Undo2 className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8 p-0"
              title={expanded ? "Collapse" : "Edit"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {expanded && (
          <>
            <Separator className="my-3" />
            <WaitingForForm
              initialData={{
                description: item.description,
                person: item.person,
                dueDate: item.dueDate,
                followUpDate: item.followUpDate,
              }}
              onSubmit={handleUpdate}
              onCancel={() => setExpanded(false)}
              submitLabel="Save"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
