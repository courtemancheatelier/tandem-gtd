"use client";

import { ClipboardCheck } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ReviewWizard } from "@/components/review/ReviewWizard";
import { ReviewHistory } from "@/components/review/ReviewHistory";
import { HelpLink } from "@/components/shared/HelpLink";

export default function ReviewPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          Weekly Review
          <HelpLink slug="reflect" />
        </h1>
        <p className="text-muted-foreground mt-1">
          Guided review of all your commitments — get clear, current, and creative.
        </p>
      </div>

      <Separator />

      {/* Active review wizard */}
      <ReviewWizard />

      {/* Past reviews */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Past Reviews</h2>
        <ReviewHistory />
      </div>
    </div>
  );
}
