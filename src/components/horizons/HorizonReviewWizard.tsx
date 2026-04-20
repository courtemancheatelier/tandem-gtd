"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Play,
  RotateCcw,
  Mountain,
  CheckCircle,
  Info,
} from "lucide-react";
import { PurposeStep } from "./steps/PurposeStep";
import { VisionStep } from "./steps/VisionStep";
import { GoalsReviewStep } from "./steps/GoalsReviewStep";
import { AreasReviewStep } from "./steps/AreasReviewStep";
import { ProjectsSummaryStep } from "./steps/ProjectsSummaryStep";
import { ActionsSummaryStep } from "./steps/ActionsSummaryStep";

type HorizonReviewType = "INITIAL_SETUP" | "QUARTERLY" | "ANNUAL";

interface StepProps {
  mode: "setup" | "review";
  notes: string;
  onNotesChange: (val: string) => void;
  onMarkComplete: () => void;
  onBack?: () => void;
  saving: boolean;
}

interface StepDef {
  key: string;
  component: React.ComponentType<StepProps>;
  label: string;
  tooltip: string;
}

const STEP_CONFIG: Record<HorizonReviewType, StepDef[]> = {
  INITIAL_SETUP: [
    { key: "purpose", component: PurposeStep, label: "Purpose", tooltip: "Define your life purpose — the \"why\" behind everything. Write freely, it can evolve." },
    { key: "vision", component: VisionStep, label: "Vision", tooltip: "Describe your ideal life in 3-5 years. Be specific enough to feel it." },
    { key: "goals", component: GoalsReviewStep, label: "Goals", tooltip: "Create 1-2 year goals that connect to your vision. What would make it real?" },
    { key: "areas", component: AreasReviewStep, label: "Areas", tooltip: "Add your ongoing areas of responsibility — the things that would fall apart if ignored." },
    { key: "projects", component: ProjectsSummaryStep, label: "Projects", tooltip: "Quick check on your active projects. Capture any new project ideas to your inbox." },
    { key: "actions", component: ActionsSummaryStep, label: "Actions", tooltip: "Quick check on your next actions. Capture anything on your mind before finishing." },
  ],
  QUARTERLY: [
    { key: "goals", component: GoalsReviewStep, label: "Goals", tooltip: "Review each goal — update progress, mark achieved ones, defer or drop what no longer serves you." },
    { key: "vision", component: VisionStep, label: "Vision", tooltip: "Re-read your vision statement. Does it still resonate? Edit if something has shifted." },
    { key: "purpose", component: PurposeStep, label: "Purpose", tooltip: "Quick gut check on your purpose. Still aligned? This rarely changes, but it's worth a pause." },
  ],
  ANNUAL: [
    { key: "purpose", component: PurposeStep, label: "Purpose", tooltip: "Deep reflection — has your sense of purpose evolved this year?" },
    { key: "vision", component: VisionStep, label: "Vision", tooltip: "What's your 3-5 year vision now? What came true? What shifted?" },
    { key: "goals", component: GoalsReviewStep, label: "Goals", tooltip: "Full goal audit — review achieved, deferred, and set new goals for the year ahead." },
    { key: "areas", component: AreasReviewStep, label: "Areas", tooltip: "Any areas to add, archive, or reprioritize for the coming year?" },
    { key: "projects", component: ProjectsSummaryStep, label: "Projects", tooltip: "Which projects are stale? Which align with your updated goals?" },
    { key: "actions", component: ActionsSummaryStep, label: "Actions", tooltip: "Any lingering actions that no longer serve your direction?" },
  ],
};

const TYPE_LABELS: Record<HorizonReviewType, string> = {
  INITIAL_SETUP: "Horizons Setup",
  QUARTERLY: "Quarterly Review",
  ANNUAL: "Annual Review",
};

interface HorizonReview {
  id: string;
  type: HorizonReviewType;
  status: string;
  checklist: Record<string, boolean> | null;
  notes: Record<string, string> | null;
  completedAt: string | null;
  createdAt: string;
}

interface HorizonReviewWizardProps {
  type: HorizonReviewType;
}

export function HorizonReviewWizard({ type }: HorizonReviewWizardProps) {
  const [review, setReview] = useState<HorizonReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Use the actual review's type when one exists (it may differ from the prop
  // if the user navigates away and comes back via a different entry point)
  const activeType = (review?.type as HorizonReviewType) || type;
  const steps = STEP_CONFIG[activeType];
  const mode = activeType === "INITIAL_SETUP" ? "setup" : "review";

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/horizon-reviews/current");
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setReview(data);
          // Restore step from checklist
          const checklist = data.checklist || {};
          const configSteps = STEP_CONFIG[data.type as HorizonReviewType];
          let restored = 0;
          for (let i = 0; i < configSteps.length; i++) {
            if (checklist[configSteps[i].key]) {
              restored = i + 1;
            } else {
              break;
            }
          }
          // Don't go past the last step
          setCurrentStep(Math.min(restored, configSteps.length - 1));
          // Restore notes
          if (data.notes && typeof data.notes === "object") {
            setStepNotes(data.notes);
          }
        }
      }
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  async function startReview() {
    setStarting(true);
    try {
      const res = await fetch("/api/horizon-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (res.ok) {
        const data = await res.json();
        setReview(data);
        setCurrentStep(0);
        setStepNotes({});
        toast({ title: `${TYPE_LABELS[type]} started` });
      } else {
        const err = await res.json();
        toast({
          title: "Could not start review",
          description: err.error || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to start review",
        variant: "destructive",
      });
    }
    setStarting(false);
  }

  async function saveProgress(stepKey: string) {
    if (!review) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/horizon-reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist: { [stepKey]: true },
          notes: stepNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setReview(data);
      } else {
        toast({
          title: "Failed to save progress",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Failed to save progress",
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  async function handleStepComplete(stepIndex: number) {
    const stepKey = steps[stepIndex].key;
    await saveProgress(stepKey);

    if (stepIndex < steps.length - 1) {
      setCurrentStep(stepIndex + 1);
      toast({
        title: `${steps[stepIndex].label} complete`,
        description: `Moving to ${steps[stepIndex + 1].label}`,
      });
    } else {
      await completeReview();
    }
  }

  async function completeReview() {
    if (!review) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/horizon-reviews/${review.id}/complete`, {
        method: "POST",
      });

      if (res.ok) {
        setReview(null);
        setCurrentStep(0);
        setStepNotes({});
        toast({
          title: `${TYPE_LABELS[type]} complete!`,
          description: "Your horizons are up to date.",
        });
      } else {
        toast({
          title: "Failed to complete review",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Failed to complete review",
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  const checklist = review?.checklist || {};
  const completedSteps = steps.map((s) => !!checklist[s.key]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No active review — show start button
  if (!review) {
    return (
      <Card>
        <CardContent className="py-8 md:py-12 px-4 md:px-6 text-center">
          <Mountain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{TYPE_LABELS[activeType]}</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm md:text-base">
            {activeType === "INITIAL_SETUP"
              ? "Walk through your horizons of focus from life purpose down to daily actions. This takes about 15-20 minutes."
              : activeType === "QUARTERLY"
                ? "Check in on your goals, vision, and purpose. Are you still aligned with where you want to go?"
                : "A deep review of all six horizons. Reflect on the year and set direction for the next one."}
          </p>
          <Button size="lg" onClick={startReview} disabled={starting}>
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {activeType === "INITIAL_SETUP" ? "Begin Setup" : "Begin Review"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Active review — show wizard
  const StepComponent = steps[currentStep].component;

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-sm">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          {TYPE_LABELS[review.type as HorizonReviewType]} in progress
        </Badge>
        <span className="text-sm text-muted-foreground">
          Step {currentStep + 1} of {steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all duration-500"
          style={{
            width: `${(completedSteps.filter(Boolean).length / steps.length) * 100}%`,
          }}
        />
      </div>

      {/* Step indicators */}
      <div className="grid grid-cols-3 md:flex md:items-center gap-2 text-xs text-muted-foreground">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1.5">
            <div
              className={`
                h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0
                ${
                  currentStep === i
                    ? "bg-primary text-primary-foreground"
                    : completedSteps[i]
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                }
              `}
            >
              {completedSteps[i] ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={
                currentStep === i ? "text-foreground font-medium" : ""
              }
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step tooltip — only for quarterly/annual reviews */}
      {activeType !== "INITIAL_SETUP" && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 border px-3 py-2.5">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {steps[currentStep].tooltip}
          </p>
        </div>
      )}

      {/* Step content */}
      <StepComponent
        mode={mode}
        notes={stepNotes[steps[currentStep].key] || ""}
        onNotesChange={(val) =>
          setStepNotes((prev) => ({ ...prev, [steps[currentStep].key]: val }))
        }
        onMarkComplete={() => handleStepComplete(currentStep)}
        onBack={currentStep > 0 ? handleBack : undefined}
        saving={saving}
      />
    </div>
  );
}
