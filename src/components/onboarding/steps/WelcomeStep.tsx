"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Database, Check, Loader2 } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
  sampleDataLoaded?: boolean;
  onLoadSampleData?: () => Promise<void>;
}

export function WelcomeStep({ onNext, onSkip, sampleDataLoaded, onLoadSampleData }: WelcomeStepProps) {
  const [loading, setLoading] = useState(false);
  return (
    <Card>
      <CardContent className="py-8 md:py-12 px-6 md:px-10">
        <h2 className="text-2xl font-bold mb-4">Welcome to Tandem</h2>
        <p className="text-muted-foreground mb-6">
          Tandem is built on Getting Things Done (GTD), a system for managing
          everything on your plate without keeping it all in your head.
        </p>

        <div className="space-y-3 mb-8">
          <p className="font-medium">Here&apos;s how it works in 30 seconds:</p>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Capture</span> —
              Dump everything into your Inbox
            </li>
            <li>
              <span className="font-medium text-foreground">Clarify</span> —
              Decide what each item means
            </li>
            <li>
              <span className="font-medium text-foreground">Organize</span> —
              Put it in the right place
            </li>
            <li>
              <span className="font-medium text-foreground">Reflect</span> —
              Weekly review to stay current
            </li>
            <li>
              <span className="font-medium text-foreground">Engage</span> — Do
              the right thing, right now
            </li>
          </ol>
        </div>

        <p className="text-muted-foreground mb-6">
          Let&apos;s get you set up in under 5 minutes.
        </p>

        {onLoadSampleData && (
          <div className="mb-8 p-4 rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground mb-2">
              Want to explore with example data? Load sample projects, tasks, and inbox items to see how Tandem works.
            </p>
            {sampleDataLoaded ? (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                Sample data loaded! You can remove it later.
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setLoading(true);
                  await onLoadSampleData();
                  setLoading(false);
                }}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-1" />
                )}
                Load sample data
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button onClick={onNext} size="lg">
            Get Started
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip — I know GTD
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
