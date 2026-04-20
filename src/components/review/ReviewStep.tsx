"use client";

import { CheckCircle } from "lucide-react";

interface ReviewStepProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  description: string;
  isCompleted: boolean;
  isActive: boolean;
  children: React.ReactNode;
}

export function ReviewStep({
  stepNumber,
  totalSteps,
  title,
  description,
  isCompleted,
  isActive,
  children,
}: ReviewStepProps) {
  return (
    <div className="space-y-4">
      {/* Step header */}
      <div className="flex items-start gap-3">
        <div
          className={`
            h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0
            ${
              isCompleted
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }
          `}
        >
          {isCompleted ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            stepNumber
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{title}</h3>
            <span className="text-xs text-muted-foreground">
              Step {stepNumber} of {totalSteps}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {/* Step content */}
      {isActive && (
        <div className="ml-11">
          {children}
        </div>
      )}
    </div>
  );
}

interface StepIndicatorBarProps {
  currentStep: number;
  totalSteps: number;
  completedSteps: boolean[];
}

export function StepIndicatorBar({
  currentStep,
  totalSteps,
  completedSteps,
}: StepIndicatorBarProps) {
  const stepLabels = ["Get Clear", "Get Current", "Get Creative"];

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span
              className={
                completedSteps[i - 1]
                  ? "text-primary"
                  : "text-muted-foreground/30"
              }
            >
              ---
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <div
              className={`
                h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium
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
              {stepLabels[i]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
