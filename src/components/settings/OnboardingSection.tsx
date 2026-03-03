"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";

export function OnboardingSection() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  async function handleReplay() {
    setResetting(true);
    try {
      await fetch("/api/onboarding/reset", { method: "POST" });
      router.push("/onboarding");
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Onboarding Tutorial</CardTitle>
        <CardDescription>
          Replay the getting-started tutorial to review GTD basics and Tandem
          features.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={handleReplay} disabled={resetting}>
          {resetting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4 mr-2" />
              Replay Onboarding Tutorial
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
