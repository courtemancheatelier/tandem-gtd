"use client";

import { TicklerList } from "@/components/tasks/TicklerList";
import { Calendar } from "lucide-react";

export default function TicklerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" />
          Tickler File
        </h1>
        <p className="text-muted-foreground mt-1">
          Tasks deferred to a future date. They will appear in Do Now when their
          scheduled date arrives.
        </p>
      </div>

      <TicklerList />
    </div>
  );
}
