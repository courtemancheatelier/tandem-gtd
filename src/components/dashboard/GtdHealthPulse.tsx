"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, RefreshCw, AlertCircle, Zap } from "lucide-react";

interface GtdHealthData {
  inboxCount: number;
  daysSinceReview: number | null;
  lastReviewDate: string | null;
  stuckProjects: { id: string; title: string; totalTasks: number }[];
  cascade: {
    thisWeek: number;
    lastWeek: number;
    sparkline: { week: string; count: number }[];
  };
}

function statusColor(level: "green" | "yellow" | "red" | "blue" | "gray") {
  switch (level) {
    case "green":
      return "border-l-green-500";
    case "yellow":
      return "border-l-yellow-500";
    case "red":
      return "border-l-red-500";
    case "blue":
      return "border-l-blue-500";
    case "gray":
      return "border-l-muted-foreground/30";
  }
}

function inboxLevel(count: number): "green" | "yellow" | "red" {
  if (count <= 5) return "green";
  if (count <= 15) return "yellow";
  return "red";
}

function reviewLevel(days: number | null): "green" | "yellow" | "red" {
  if (days === null) return "red";
  if (days <= 7) return "green";
  if (days <= 14) return "yellow";
  return "red";
}

function stuckLevel(count: number): "green" | "yellow" | "red" {
  if (count === 0) return "green";
  if (count <= 2) return "yellow";
  return "red";
}

function ReviewRing({ days }: { days: number | null }) {
  const progress = days === null ? 0 : Math.max(0, 1 - days / 7);
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(progress, 1));

  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-muted/40"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        className={
          days === null
            ? "text-red-500"
            : days <= 7
              ? "text-green-500"
              : days <= 14
                ? "text-yellow-500"
                : "text-red-500"
        }
      />
    </svg>
  );
}

function CascadeSparkline({
  data,
}: {
  data: { week: string; count: number }[];
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 80;
      const y = 24 - (d.count / max) * 20;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width="80"
      height="24"
      viewBox="0 0 80 24"
      className="inline-block ml-2"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="text-blue-500"
      />
    </svg>
  );
}

function TrendBadge({
  thisWeek,
  lastWeek,
}: {
  thisWeek: number;
  lastWeek: number;
}) {
  if (lastWeek === 0 && thisWeek === 0) return null;
  if (lastWeek === 0)
    return (
      <Badge variant="secondary" className="text-xs">
        new
      </Badge>
    );

  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  if (pct === 0) return null;

  return (
    <Badge
      variant="secondary"
      className={`text-xs ${pct > 0 ? "text-green-600" : "text-muted-foreground"}`}
    >
      {pct > 0 ? "+" : ""}
      {pct}%
    </Badge>
  );
}

export function GtdHealthPulse({ data }: { data: GtdHealthData }) {
  const stuckCount = data.stuckProjects.length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {/* Inbox */}
      <Link href="/inbox">
        <Card
          className={`border-l-4 ${statusColor(inboxLevel(data.inboxCount))} p-3 h-full hover:bg-accent/50 transition-colors`}
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Inbox className="h-4 w-4" />
            <span className="text-xs font-medium">Inbox</span>
          </div>
          <div className="text-xl font-bold">{data.inboxCount}</div>
          <p className="text-xs text-muted-foreground">
            {data.inboxCount === 0
              ? "All clear"
              : data.inboxCount === 1
                ? "item to process"
                : "items to process"}
          </p>
        </Card>
      </Link>

      {/* Review */}
      <Link href="/review">
        <Card
          className={`border-l-4 ${statusColor(reviewLevel(data.daysSinceReview))} p-3 h-full hover:bg-accent/50 transition-colors`}
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <RefreshCw className="h-4 w-4" />
            <span className="text-xs font-medium">Review</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">
              {data.daysSinceReview === null ? "Never" : `${data.daysSinceReview}d`}
            </span>
            <ReviewRing days={data.daysSinceReview} />
          </div>
          <p className="text-xs text-muted-foreground">
            {data.daysSinceReview === null
              ? "No review yet"
              : "since last review"}
          </p>
        </Card>
      </Link>

      {/* Stuck Projects */}
      <a href="#stuck-detail">
        <Card
          className={`border-l-4 ${statusColor(stuckLevel(stuckCount))} p-3 h-full hover:bg-accent/50 transition-colors`}
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Stuck</span>
          </div>
          <div className="text-xl font-bold">{stuckCount}</div>
          <p className="text-xs text-muted-foreground">
            {stuckCount === 0
              ? "All projects moving"
              : stuckCount === 1
                ? "project needs action"
                : "projects need action"}
          </p>
        </Card>
      </a>

      {/* Cascades */}
      <Card
        className={`border-l-4 ${statusColor(data.cascade.thisWeek > 0 ? "blue" : "gray")} p-3 h-full`}
      >
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Zap className="h-4 w-4" />
          <span className="text-xs font-medium">Cascades</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{data.cascade.thisWeek}</span>
          <TrendBadge
            thisWeek={data.cascade.thisWeek}
            lastWeek={data.cascade.lastWeek}
          />
        </div>
        <div className="flex items-center">
          <span className="text-xs text-muted-foreground">this week</span>
          <CascadeSparkline data={data.cascade.sparkline} />
        </div>
      </Card>
    </div>
  );
}
