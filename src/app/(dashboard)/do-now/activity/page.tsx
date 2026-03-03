"use client";

import { ActivityFeed } from "@/components/history/ActivityFeed";
import { History } from "lucide-react";

export default function ActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Activity Feed
        </h1>
        <p className="text-muted-foreground mt-1">
          Recent activity across all your tasks and projects.
        </p>
      </div>

      <ActivityFeed initialLimit={30} />
    </div>
  );
}
