"use client";

import { Separator } from "@/components/ui/separator";
import { RefreshCw } from "lucide-react";
import { RoutineList } from "@/components/routines/RoutineList";
import { HelpLink } from "@/components/shared/HelpLink";

export default function RoutinesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <RefreshCw className="h-6 w-6" />
          Routines & Recurring Cards
          <HelpLink slug="card-file-recurring" />
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage all your recurring tasks and routines in one place.
          Simple cards repeat on a schedule. Windowed routines include
          timed checklists.
        </p>
      </div>

      <Separator />

      <RoutineList />
    </div>
  );
}
