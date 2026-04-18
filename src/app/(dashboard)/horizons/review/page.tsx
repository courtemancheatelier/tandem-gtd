"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Separator } from "@/components/ui/separator";
import { Mountain, Loader2 } from "lucide-react";
import { HorizonReviewWizard } from "@/components/horizons/HorizonReviewWizard";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type HorizonReviewType = "QUARTERLY" | "ANNUAL";

const TYPE_LABELS: Record<HorizonReviewType, string> = {
  QUARTERLY: "Quarterly Review",
  ANNUAL: "Annual Review",
};

const TYPE_DESCRIPTIONS: Record<HorizonReviewType, string> = {
  QUARTERLY: "Check in on your goals, vision, and purpose",
  ANNUAL: "A deep review of all six horizons of focus",
};

function HorizonsReviewContent() {
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type")?.toUpperCase() || "QUARTERLY";
  const type: HorizonReviewType =
    rawType === "ANNUAL" ? "ANNUAL" : "QUARTERLY";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/horizons">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Horizons
          </Button>
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mountain className="h-6 w-6" />
          {TYPE_LABELS[type]}
        </h1>
        <p className="text-muted-foreground mt-1">
          {TYPE_DESCRIPTIONS[type]}
        </p>
      </div>

      <Separator />

      <HorizonReviewWizard type={type} />
    </div>
  );
}

export default function HorizonsReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <HorizonsReviewContent />
    </Suspense>
  );
}
