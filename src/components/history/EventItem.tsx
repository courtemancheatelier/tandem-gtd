"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DiffDisplay } from "./DiffDisplay";
import {
  formatEventDescription,
  formatRelativeTime,
  formatTimeOnly,
} from "@/lib/history/format";
import {
  Plus,
  CheckCircle,
  RefreshCw,
  MapPin,
  Star,
  UserPlus,
  Clock,
  Zap,
  Bot,
  Edit,
  ArrowRight,
  Trash2,
  RotateCcw,
  Link2,
  Inbox,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

export interface EventItemData {
  id: string;
  eventType: string;
  actorType: string;
  actorName: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  message: string | null;
  source: string;
  triggeredBy: string | null;
  createdAt: string;
  // For feed items
  entityType?: "task" | "project" | "inbox";
  entityId?: string;
  entityTitle?: string;
}

interface EventItemProps {
  event: EventItemData;
  showEntity?: boolean;
  isCascadeChild?: boolean;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  CREATED: Plus,
  COMPLETED: CheckCircle,
  STATUS_CHANGED: RefreshCw,
  CONTEXT_CHANGED: MapPin,
  PROMOTED: Star,
  DELEGATED: UserPlus,
  DELEGATION_ACCEPTED: UserPlus,
  DELEGATION_DECLINED: UserPlus,
  DEFERRED: Clock,
  ACTIVATED: Zap,
  DEPENDENCY_ADDED: Link2,
  DEPENDENCY_REMOVED: Link2,
  UNBLOCKED: Zap,
  ARCHIVED: Trash2,
  RESTORED: RotateCcw,
  REOPENED: RotateCcw,
  UPDATED: Edit,
  MOVED_TO_PROJECT: ArrowRight,
  REMOVED_FROM_PROJECT: ArrowRight,
  COMMENTED: Edit,
  // Project events
  REACTIVATED: RotateCcw,
  TASK_ADDED: Plus,
  TASK_REMOVED: Trash2,
  TASK_REORDERED: RefreshCw,
  NEXT_ACTION_ADVANCED: Star,
  STALLED: Clock,
  SHARED: UserPlus,
  UNSHARED: UserPlus,
  // Inbox events
  CAPTURED: Inbox,
  PROCESSED: CheckCircle,
  MERGED: Link2,
};

const EVENT_COLORS: Record<string, string> = {
  CREATED: "text-green-500",
  COMPLETED: "text-green-600",
  PROMOTED: "text-yellow-500",
  ACTIVATED: "text-yellow-500",
  UNBLOCKED: "text-yellow-500",
  DEFERRED: "text-orange-500",
  ARCHIVED: "text-red-400",
  STALLED: "text-red-400",
};

const ENTITY_LABELS: Record<string, string> = {
  task: "Task",
  project: "Project",
  inbox: "Inbox",
};

export function EventItem({ event, showEntity = false, isCascadeChild = false }: EventItemProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = EVENT_ICONS[event.eventType] ?? Edit;
  const iconColor = EVENT_COLORS[event.eventType] ?? "text-muted-foreground";
  const isCascade = event.source === "CASCADE";
  const isAI = event.actorType === "AI";
  const hasChanges =
    event.changes && typeof event.changes === "object" && Object.keys(event.changes).length > 0;

  const description = formatEventDescription({
    eventType: event.eventType,
    changes: event.changes ?? {},
    actorType: event.actorType,
    source: event.source,
  });

  return (
    <div
      className={cn(
        "group relative",
        isCascadeChild && "ml-6"
      )}
    >
      <div className="flex items-start gap-3 py-2">
        {/* Timeline dot */}
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background",
            isCascade && "border-yellow-500/50",
            event.eventType === "COMPLETED" && "border-green-500/50"
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Entity badge (for feed view) */}
            {showEntity && event.entityType && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                {ENTITY_LABELS[event.entityType] ?? event.entityType}
              </Badge>
            )}

            {/* Entity title */}
            {showEntity && event.entityTitle && (
              <span className="text-sm font-medium truncate max-w-[200px]">
                {event.entityTitle}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-foreground">
            {description}
          </p>

          {/* Meta line */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {formatTimeOnly(event.createdAt)}
            </span>
            <span className="text-xs text-muted-foreground">
              &mdash; {event.actorName}
            </span>

            {/* Source badges */}
            {isCascade && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/50 text-yellow-600">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                Cascade
              </Badge>
            )}
            {isAI && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/50 text-purple-600">
                <Bot className="h-2.5 w-2.5 mr-0.5" />
                AI
              </Badge>
            )}

            {/* Expand toggle */}
            {hasChanges && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                details
              </button>
            )}
          </div>

          {/* Message */}
          {event.message && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {event.message}
            </p>
          )}

          {/* Expanded changes */}
          {expanded && hasChanges && (
            <DiffDisplay changes={event.changes} className="mt-2" />
          )}
        </div>

        {/* Relative time (right side) */}
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(event.createdAt)}
        </span>
      </div>
    </div>
  );
}
