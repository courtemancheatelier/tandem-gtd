"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { WelcomeStep } from "./steps/WelcomeStep";
import { BrainDumpStep } from "./steps/BrainDumpStep";
import { ProcessOneStep } from "./steps/ProcessOneStep";
import { ContextsStep } from "./steps/ContextsStep";
import { AreasStep } from "./steps/AreasStep";
import { DoneStep } from "./steps/DoneStep";

const STEPS = [
  { key: "welcome", label: "Welcome" },
  { key: "braindump", label: "Brain Dump" },
  { key: "process", label: "Process" },
  { key: "contexts", label: "Contexts" },
  { key: "areas", label: "Areas" },
  { key: "done", label: "Done" },
];

interface SampleDataIds {
  areaIds: string[];
  projectIds: string[];
  taskIds: string[];
  inboxIds: string[];
}

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [brainDumpItems, setBrainDumpItems] = useState<string[]>([]);
  const [contextCount, setContextCount] = useState(0);
  const [areaCount, setAreaCount] = useState(0);
  const [sampleDataLoaded, setSampleDataLoaded] = useState(false);
  const [sampleDataIds, setSampleDataIds] = useState<SampleDataIds | null>(null);
  const router = useRouter();

  async function handleLoadSampleData() {
    try {
      const res = await fetch("/api/onboarding/sample-data", { method: "POST" });
      if (res.ok) {
        const ids: SampleDataIds = await res.json();
        setSampleDataIds(ids);
        setSampleDataLoaded(true);
      }
    } catch {
      // Non-critical
    }
  }

  async function handleRemoveSampleData() {
    if (!sampleDataIds) return;
    try {
      await fetch("/api/onboarding/sample-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleDataIds),
      });
      setSampleDataLoaded(false);
      setSampleDataIds(null);
    } catch {
      // Non-critical
    }
  }

  async function handleSkip() {
    await fetch("/api/onboarding/complete", { method: "POST" });
    router.push("/do-now");
  }

  async function handleComplete() {
    await fetch("/api/onboarding/complete", { method: "POST" });
    router.push("/do-now");
  }

  function goNext() {
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function renderStep() {
    switch (STEPS[currentStep].key) {
      case "welcome":
        return (
          <WelcomeStep
            onNext={goNext}
            onSkip={handleSkip}
            sampleDataLoaded={sampleDataLoaded}
            onLoadSampleData={handleLoadSampleData}
          />
        );
      case "braindump":
        return (
          <BrainDumpStep
            onNext={(items) => {
              setBrainDumpItems(items);
              goNext();
            }}
            onSkip={goNext}
          />
        );
      case "process":
        return (
          <ProcessOneStep
            brainDumpItems={brainDumpItems}
            onNext={goNext}
            onSkip={goNext}
          />
        );
      case "contexts":
        return (
          <ContextsStep
            onNext={(count) => {
              setContextCount(count);
              goNext();
            }}
            onSkip={goNext}
          />
        );
      case "areas":
        return (
          <AreasStep
            onNext={(count) => {
              setAreaCount(count);
              goNext();
            }}
            onSkip={goNext}
          />
        );
      case "done":
        return (
          <DoneStep
            brainDumpCount={Math.max(brainDumpItems.length - 1, 0)}
            contextCount={contextCount}
            areaCount={areaCount}
            sampleDataLoaded={sampleDataLoaded}
            onRemoveSampleData={handleRemoveSampleData}
            onComplete={handleComplete}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((step, i) => (
          <div
            key={step.key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= currentStep ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>

      {/* Step label */}
      <p className="text-sm text-muted-foreground mb-4">
        Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep].label}
      </p>

      {/* Current step */}
      {renderStep()}
    </div>
  );
}
