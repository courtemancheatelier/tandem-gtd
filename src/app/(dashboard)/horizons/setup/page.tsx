"use client";

import { Separator } from "@/components/ui/separator";
import { Mountain } from "lucide-react";
import { HorizonReviewWizard } from "@/components/horizons/HorizonReviewWizard";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function HorizonsSetupPage() {
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
          Set Up Your Horizons
        </h1>
        <p className="text-muted-foreground mt-1">
          Walk through your horizons of focus from life purpose down to daily actions
        </p>
      </div>

      <Separator />

      <HorizonReviewWizard type="INITIAL_SETUP" />
    </div>
  );
}
