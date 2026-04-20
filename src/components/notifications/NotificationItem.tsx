"use client";

import { cn } from "@/lib/utils";
import {
  Bell,
  Calendar,
  ClipboardCheck,
  AlertTriangle,
  Info,
  MessageSquare,
  Trash2,
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function getIcon(type: string) {
  switch (type) {
    case "TASK_DUE_TODAY":
    case "TASK_DUE_TOMORROW":
      return Calendar;
    case "TASK_OVERDUE":
      return AlertTriangle;
    case "WEEKLY_REVIEW_REMINDER":
      return ClipboardCheck;
    case "RETENTION_WARNING":
      return Trash2;
    case "THREAD_MENTION":
      return MessageSquare;
    case "SYSTEM":
      return Info;
    default:
      return Bell;
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface NotificationItemProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const Icon = getIcon(notification.type);

  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent",
        !notification.isRead && "bg-accent/50"
      )}
      onClick={() => onClick(notification)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm", !notification.isRead && "font-medium")}>
            {notification.title}
          </span>
          {!notification.isRead && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        {notification.body && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {notification.body}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}
