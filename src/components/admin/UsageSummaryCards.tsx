"use client";

import { Card } from "@/components/ui/card";
import {
  Users,
  CheckSquare,
  FolderKanban,
  Inbox,
  RefreshCw,
} from "lucide-react";

interface SummaryData {
  totalUsers: number;
  totalTasks: number;
  totalCompleted: number;
  totalProjects: number;
  totalInboxProcessed: number;
  totalReviews: number;
  engagement: {
    active: number;
    new: number;
    drifting: number;
    dormant: number;
  };
}

const cards = [
  {
    key: "users",
    icon: Users,
    label: "Total Users",
    color: "border-l-blue-500",
    getValue: (d: SummaryData) => d.totalUsers,
    getSub: (d: SummaryData) =>
      `${d.engagement.active} active, ${d.engagement.new} new`,
  },
  {
    key: "tasks",
    icon: CheckSquare,
    label: "Tasks Created",
    color: "border-l-green-500",
    getValue: (d: SummaryData) => d.totalTasks,
    getSub: (d: SummaryData) => `${d.totalCompleted} completed`,
  },
  {
    key: "projects",
    icon: FolderKanban,
    label: "Projects Created",
    color: "border-l-purple-500",
    getValue: (d: SummaryData) => d.totalProjects,
    getSub: () => "across all users",
  },
  {
    key: "inbox",
    icon: Inbox,
    label: "Inbox Processed",
    color: "border-l-yellow-500",
    getValue: (d: SummaryData) => d.totalInboxProcessed,
    getSub: () => "items clarified",
  },
  {
    key: "reviews",
    icon: RefreshCw,
    label: "Weekly Reviews",
    color: "border-l-cyan-500",
    getValue: (d: SummaryData) => d.totalReviews,
    getSub: () => "completed reviews",
  },
] as const;

export function UsageSummaryCards({ data }: { data: SummaryData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.key}
            className={`border-l-4 ${c.color} p-3`}
          >
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-medium">{c.label}</span>
            </div>
            <div className="text-xl font-bold">
              {c.getValue(data).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">{c.getSub(data)}</p>
          </Card>
        );
      })}
    </div>
  );
}
