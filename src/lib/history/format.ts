/**
 * Human-readable formatting helpers for history events.
 */

// ─── Event Description ───────────────────────────────────────────────

type EventInput = {
  eventType: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  actorType: string;
  source: string;
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  COMPLETED: "Completed task",
  REOPENED: "Reopened task",
  STATUS_CHANGED: "Changed status",
  CONTEXT_CHANGED: "Changed context",
  MOVED_TO_PROJECT: "Moved to project",
  REMOVED_FROM_PROJECT: "Removed from project",
  DELEGATED: "Delegated task",
  DELEGATION_ACCEPTED: "Accepted delegation",
  DELEGATION_DECLINED: "Declined delegation",
  DEFERRED: "Deferred task",
  ACTIVATED: "Activated task",
  DEPENDENCY_ADDED: "Added dependency",
  DEPENDENCY_REMOVED: "Removed dependency",
  UNBLOCKED: "Task unblocked",
  PROMOTED: "Promoted to next action",
  ARCHIVED: "Archived",
  RESTORED: "Restored",
  COMMENTED: "Added comment",
  // Project events
  REACTIVATED: "Reactivated project",
  TASK_ADDED: "Added task",
  TASK_REMOVED: "Removed task",
  TASK_REORDERED: "Reordered tasks",
  NEXT_ACTION_ADVANCED: "Advanced next action",
  STALLED: "Project stalled",
  SHARED: "Shared project",
  UNSHARED: "Unshared project",
  // Inbox events
  CAPTURED: "Captured item",
  PROCESSED: "Processed item",
  MERGED: "Merged items",
};

export function formatEventDescription(event: EventInput): string {
  const base = EVENT_DESCRIPTIONS[event.eventType] ?? event.eventType;

  // Add detail from changes for certain event types
  const changes = event.changes ?? {};
  if (event.eventType === "STATUS_CHANGED" && changes.status) {
    return `Changed status from ${formatValue(changes.status.old)} to ${formatValue(changes.status.new)}`;
  }
  if (event.eventType === "CONTEXT_CHANGED") {
    const contextField = changes.contextId ?? changes.context;
    if (contextField) {
      const oldCtx = formatContextValue(contextField.old);
      const newCtx = formatContextValue(contextField.new);
      return `Changed context from ${oldCtx} to ${newCtx}`;
    }
  }

  // Add source qualifier
  const suffix = formatSourceSuffix(event.source, event.actorType);
  return suffix ? `${base} ${suffix}` : base;
}

function formatContextValue(val: unknown): string {
  if (val === null || val === undefined) return "none";
  if (typeof val === "string") {
    return val.startsWith("@") ? val : `@${val}`;
  }
  return String(val);
}

function formatSourceSuffix(source: string, actorType: string): string {
  if (source === "CASCADE") return "(cascade)";
  if (actorType === "AI") return "(via AI)";
  if (source === "MCP") return "(via MCP)";
  if (source === "SCHEDULER") return "(scheduled)";
  if (source === "IMPORT") return "(imported)";
  return "";
}

// ─── Field Change ────────────────────────────────────────────────────

export function formatFieldChange(
  field: string,
  oldVal: unknown,
  newVal: unknown
): string {
  const label = FIELD_LABELS[field] ?? camelToTitle(field);
  return `${label}: ${formatValue(oldVal)} \u2192 ${formatValue(newVal)}`;
}

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  status: "status",
  contextId: "context",
  context: "context",
  projectId: "project",
  energyLevel: "energy",
  estimatedMins: "estimated time",
  scheduledDate: "scheduled date",
  dueDate: "due date",
  isNextAction: "next action",
  notes: "notes",
  sortOrder: "sort order",
  assignedToId: "assigned to",
  description: "description",
  outcome: "outcome",
  type: "project type",
  isSomedayMaybe: "someday/maybe",
  aiVisibility: "AI visibility",
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "none";
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (typeof val === "number") return String(val);

  const str = String(val);

  // Try to parse ISO date strings
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try {
      const d = new Date(str);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return str;
    }
  }

  // Format enum values: SOME_VALUE -> Some Value
  if (/^[A-Z_]+$/.test(str)) {
    return str
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }

  return str;
}

function camelToTitle(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
    .toLowerCase();
}

// ─── Group By Date ───────────────────────────────────────────────────

export function groupEventsByDate<T extends { createdAt: string }>(
  events: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const event of events) {
    const label = getDateLabel(event.createdAt);
    const existing = groups.get(label);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(label, [event]);
    }
  }

  return groups;
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - eventDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Time Formatting ─────────────────────────────────────────────────

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatTimeOnly(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
