"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Star,
  Target,
  ChevronDown,
  ChevronRight,
  FolderCheck,
  type LucideIcon,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface CascadeNodeData {
  id: string;
  type: "task" | "project" | "goal";
  title: string;
  eventType: string;
  timestamp: string;
  children: CascadeNodeData[];
}

interface CascadeNodeProps {
  node: CascadeNodeData;
  depth?: number;
  isLast?: boolean;
}

// ============================================================================
// Configuration maps
// ============================================================================

const NODE_ICONS: Record<string, LucideIcon> = {
  task: Star,
  project: FolderCheck,
  goal: Target,
};

const EVENT_LABELS: Record<string, string> = {
  PROMOTED: "Promoted to next action",
  COMPLETED: "Auto-completed",
  PROGRESS_UPDATED: "Progress updated",
  STATUS_CHANGED: "Status changed",
  NEXT_ACTION_ADVANCED: "Next action advanced",
};

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  PROMOTED: {
    bg: "bg-green-500/10",
    border: "border-green-500/40",
    text: "text-green-600 dark:text-green-400",
    badge: "border-green-500/50 text-green-600 dark:text-green-400",
  },
  COMPLETED: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/40",
    text: "text-blue-600 dark:text-blue-400",
    badge: "border-blue-500/50 text-blue-600 dark:text-blue-400",
  },
  PROGRESS_UPDATED: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/40",
    text: "text-yellow-600 dark:text-yellow-400",
    badge: "border-yellow-500/50 text-yellow-600 dark:text-yellow-400",
  },
};

const TYPE_LABELS: Record<string, string> = {
  task: "Task",
  project: "Project",
  goal: "Goal",
};

// ============================================================================
// Helper: get link for entity
// ============================================================================

function getEntityLink(type: string, id: string): string {
  switch (type) {
    case "task":
      return `/tasks/${id}`;
    case "project":
      return `/projects/${id}`;
    case "goal":
      return `/goals/${id}`;
    default:
      return "#";
  }
}

// ============================================================================
// Component
// ============================================================================

export function CascadeNode({ node, depth = 0, isLast = false }: CascadeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const Icon = NODE_ICONS[node.type] ?? CheckCircle;
  const colors = EVENT_COLORS[node.eventType] ?? EVENT_COLORS.PROMOTED;
  const label = EVENT_LABELS[node.eventType] ?? node.eventType;

  return (
    <div className="relative">
      {/* Vertical connecting line from parent */}
      {depth > 0 && (
        <div
          className={cn(
            "absolute left-0 top-0 w-px bg-border",
            isLast ? "h-5" : "h-full"
          )}
          style={{ left: "-16px" }}
        />
      )}

      {/* Horizontal connecting line from parent */}
      {depth > 0 && (
        <div
          className="absolute top-5 h-px bg-border"
          style={{ left: "-16px", width: "16px" }}
        />
      )}

      {/* Node content */}
      <div
        className={cn(
          "relative flex items-start gap-3 rounded-lg border p-3 transition-colors",
          colors.bg,
          colors.border
        )}
      >
        {/* Collapse toggle + Icon */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {hasChildren ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 rounded hover:bg-accent transition-colors"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-[22px]" /> // spacer for alignment
          )}
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border",
              colors.border,
              colors.bg
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", colors.text)} />
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal", colors.badge)}>
              {TYPE_LABELS[node.type] ?? node.type}
            </Badge>
            <span className={cn("text-xs font-medium", colors.text)}>
              {label}
            </span>
          </div>

          <Link
            href={getEntityLink(node.type, node.id)}
            className="text-sm font-medium hover:underline mt-0.5 block truncate"
          >
            {node.title}
          </Link>

          <span className="text-xs text-muted-foreground">
            {new Date(node.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="relative ml-8 mt-2 space-y-2">
          {node.children.map((child, index) => (
            <CascadeNode
              key={`${child.type}-${child.id}`}
              node={child}
              depth={depth + 1}
              isLast={index === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
