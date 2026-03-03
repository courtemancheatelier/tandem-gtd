"use client";

import { Separator } from "@/components/ui/separator";
import { RefreshCw } from "lucide-react";
import { RecurringTemplateList } from "@/components/recurring/RecurringTemplateList";
import { HelpLink } from "@/components/shared/HelpLink";

export default function RecurringTemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <RefreshCw className="h-6 w-6" />
          Recurring Templates
          <HelpLink slug="card-file-recurring" />
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage recurring task templates that automatically generate tasks on a
          schedule.
        </p>
      </div>

      <Separator />

      <RecurringTemplateList />
    </div>
  );
}
