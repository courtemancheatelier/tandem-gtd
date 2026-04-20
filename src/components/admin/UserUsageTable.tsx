"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  Target,
  Map,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UserMetric {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  lastActive: string | null;
  engagement: "new" | "active" | "drifting" | "dormant";
  tasks: { total: number; active: number; completed: number; dropped: number };
  projects: { total: number; active: number; completed: number; someday: number };
  inbox: {
    captured: number;
    processed: number;
    unprocessed: number;
    processingSessions: number;
    lastProcessed: string | null;
    processingRate: number | null;
  };
  waitingFor: { total: number; unresolved: number };
  reviews: { completed: number; lastReview: string | null };
  setup: { contexts: number; areas: number; goals: number; horizonNotes: number };
}

type SortKey =
  | "name"
  | "createdAt"
  | "lastActive"
  | "tasks"
  | "projects"
  | "inbox"
  | "reviews";

const engagementConfig = {
  active: {
    label: "Active",
    className: "border-green-400 text-green-600 bg-green-50",
  },
  new: {
    label: "New",
    className: "border-blue-400 text-blue-600 bg-blue-50",
  },
  drifting: {
    label: "Drifting",
    className: "border-yellow-400 text-yellow-600 bg-yellow-50",
  },
  dormant: {
    label: "Dormant",
    className: "border-gray-400 text-gray-500 bg-gray-50",
  },
} as const;

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function MiniBar({
  value,
  total,
  color = "bg-primary",
}: {
  value: number;
  total: number;
  color?: string;
}) {
  if (total === 0) return <span className="text-muted-foreground">-</span>;
  const pct = Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono whitespace-nowrap">
        {value}/{total}
      </span>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SetupIndicators({
  setup,
}: {
  setup: UserMetric["setup"];
}) {
  const items = [
    { icon: Circle, label: "Contexts", count: setup.contexts },
    { icon: Map, label: "Areas", count: setup.areas },
    { icon: Target, label: "Goals", count: setup.goals },
    { icon: CheckCircle2, label: "Horizons", count: setup.horizonNotes },
  ];
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <span>
                  <Icon
                    className={`h-3 w-3 ${
                      item.count > 0 ? "text-green-500" : "text-muted-foreground/30"
                    }`}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {item.label}: {item.count}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function UserUsageTable({ users }: { users: UserMetric[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("lastActive");
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = (a.name ?? a.email).localeCompare(b.name ?? b.email);
          break;
        case "createdAt":
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "lastActive":
          cmp =
            (a.lastActive ? new Date(a.lastActive).getTime() : 0) -
            (b.lastActive ? new Date(b.lastActive).getTime() : 0);
          break;
        case "tasks":
          cmp = a.tasks.completed - b.tasks.completed;
          break;
        case "projects":
          cmp = a.projects.active - b.projects.active;
          break;
        case "inbox":
          cmp = (a.inbox.processingRate ?? -1) - (b.inbox.processingRate ?? -1);
          break;
        case "reviews":
          cmp = a.reviews.completed - b.reviews.completed;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [users, sortKey, sortAsc]);

  function SortHeader({
    label,
    sortId,
    className = "",
  }: {
    label: string;
    sortId: SortKey;
    className?: string;
  }) {
    return (
      <th className={`py-3 px-2 font-medium text-muted-foreground ${className}`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-xs font-medium gap-1"
          onClick={() => handleSort(sortId)}
        >
          {label}
          <ArrowUpDown
            className={`h-3 w-3 ${
              sortKey === sortId ? "text-foreground" : "text-muted-foreground/50"
            }`}
          />
        </Button>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <SortHeader label="User" sortId="name" className="text-left" />
            <SortHeader label="Joined" sortId="createdAt" className="text-left hidden lg:table-cell" />
            <SortHeader label="Last Active" sortId="lastActive" className="text-left" />
            <SortHeader label="Tasks" sortId="tasks" className="text-left" />
            <SortHeader label="Projects" sortId="projects" className="text-left hidden md:table-cell" />
            <SortHeader label="Inbox" sortId="inbox" className="text-left hidden md:table-cell" />
            <SortHeader label="Reviews" sortId="reviews" className="text-center hidden lg:table-cell" />
            <th className="py-3 px-2 font-medium text-muted-foreground text-center hidden lg:table-cell">
              Setup
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => {
            const eng = engagementConfig[u.engagement];
            return (
              <tr
                key={u.id}
                className="border-b last:border-0 hover:bg-muted/50"
              >
                {/* User */}
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate max-w-[8rem]">
                      {u.name ?? u.email}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${eng.className}`}
                    >
                      {eng.label}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-[12rem]">
                    {u.email}
                  </div>
                </td>

                {/* Joined */}
                <td className="py-3 px-2 text-xs text-muted-foreground hidden lg:table-cell">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>

                {/* Last Active */}
                <td className="py-3 px-2 text-xs text-muted-foreground">
                  {formatRelative(u.lastActive)}
                </td>

                {/* Tasks */}
                <td className="py-3 px-2">
                  <MiniBar
                    value={u.tasks.completed}
                    total={u.tasks.total}
                    color="bg-green-500"
                  />
                </td>

                {/* Projects */}
                <td className="py-3 px-2 hidden md:table-cell">
                  <MiniBar
                    value={u.projects.active}
                    total={u.projects.total}
                    color="bg-purple-500"
                  />
                </td>

                {/* Inbox */}
                <td className="py-3 px-2 hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono whitespace-nowrap">
                      {u.inbox.processed}/{u.inbox.captured}
                    </span>
                    {u.inbox.processingRate !== null && (
                      <span
                        className={`text-[10px] font-mono ${
                          u.inbox.processingRate >= 80
                            ? "text-green-600"
                            : u.inbox.processingRate >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {u.inbox.processingRate}%
                      </span>
                    )}
                  </div>
                </td>

                {/* Reviews */}
                <td className="py-3 px-2 text-center hidden lg:table-cell">
                  <div className="text-xs font-mono">{u.reviews.completed}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatRelative(u.reviews.lastReview)}
                  </div>
                </td>

                {/* Setup */}
                <td className="py-3 px-2 hidden lg:table-cell">
                  <div className="flex justify-center">
                    <SetupIndicators setup={u.setup} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No users found.
        </p>
      )}
    </div>
  );
}
