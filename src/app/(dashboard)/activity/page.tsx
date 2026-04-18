"use client";

import { ActivityFeed } from "@/components/history/ActivityFeed";

export default function ActivityPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Recent changes across your tasks, projects, and inbox
        </p>
      </div>
      <ActivityFeed initialLimit={20} />
    </div>
  );
}
