"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Inbox, CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProcessingStep1 } from "./ProcessingStep1";
import { ProcessingStep2a, type NotActionableData } from "./ProcessingStep2a";
import { ProcessingStep2b, type ActionableData } from "./ProcessingStep2b";
import { ProcessingStep3 } from "./ProcessingStep3";
import { HelpLink } from "@/components/shared/HelpLink";

interface InboxItem {
  id: string;
  content: string;
  notes: string | null;
  createdAt: string;
  status: string;
}

type Step = "review" | "not_actionable" | "actionable" | "confirm";

export function ProcessingWizard() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<Step>("review");
  const [decision, setDecision] = useState<"actionable" | "not_actionable">(
    "not_actionable"
  );
  const [notActionableData, setNotActionableData] =
    useState<NotActionableData | null>(null);
  const [actionableData, setActionableData] = useState<ActionableData | null>(
    null
  );
  const [processedCount, setProcessedCount] = useState(0);
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/inbox");
    if (res.ok) {
      const data: InboxItem[] = await res.json();
      setItems(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const currentItem = items[currentIndex];
  const totalItems = items.length + processedCount;

  function resetWizard() {
    setStep("review");
    setDecision("not_actionable");
    setNotActionableData(null);
    setActionableData(null);
  }

  function handleActionable() {
    setDecision("actionable");
    setStep("actionable");
  }

  function handleNotActionable() {
    setDecision("not_actionable");
    setStep("not_actionable");
  }

  function handleNotActionableConfirm(data: NotActionableData) {
    setNotActionableData(data);
    setStep("confirm");
  }

  function handleActionableConfirm(data: ActionableData) {
    setActionableData(data);
    setStep("confirm");
  }

  function handleBack() {
    if (step === "confirm") {
      setStep(decision === "actionable" ? "actionable" : "not_actionable");
    } else {
      setStep("review");
    }
  }

  async function handleProcess() {
    if (!currentItem) return;
    setProcessing(true);

    try {
      // Build the payload
      const payload: Record<string, unknown> = {
        decision,
      };

      if (decision === "not_actionable" && notActionableData) {
        payload.disposition = notActionableData.disposition;
        if (notActionableData.somedayTitle) {
          payload.somedayTitle = notActionableData.somedayTitle;
        }
        if (notActionableData.referenceTitle) {
          payload.referenceTitle = notActionableData.referenceTitle;
        }
        if (notActionableData.referenceContent) {
          payload.referenceContent = notActionableData.referenceContent;
        }
      }

      if (decision === "actionable" && actionableData) {
        payload.taskTitle = actionableData.taskTitle;
        payload.twoMinuteTask = actionableData.twoMinuteTask;
        if (actionableData.projectId) payload.projectId = actionableData.projectId;
        if (actionableData.newProjectTitle)
          payload.newProjectTitle = actionableData.newProjectTitle;
        if (actionableData.contextId) payload.contextId = actionableData.contextId;
        if (actionableData.energyLevel)
          payload.energyLevel = actionableData.energyLevel;
        if (actionableData.estimatedMins)
          payload.estimatedMins = actionableData.estimatedMins;
        if (actionableData.scheduledDate)
          payload.scheduledDate = actionableData.scheduledDate;
        if (actionableData.dueDate) payload.dueDate = actionableData.dueDate;
        if (actionableData.delegateTo)
          payload.delegateTo = actionableData.delegateTo;
      }

      const res = await fetch(`/api/inbox/${currentItem.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({
          title: "Error processing item",
          description: err.error || "Something went wrong",
          variant: "destructive",
        });
        setProcessing(false);
        return;
      }

      // Success
      const dispositionLabel =
        decision === "not_actionable"
          ? notActionableData?.disposition === "trash"
            ? "Trashed"
            : notActionableData?.disposition === "someday"
              ? "Moved to Someday/Maybe"
              : "Saved to wiki"
          : actionableData?.twoMinuteTask
            ? "Task completed"
            : actionableData?.delegateTo
              ? "Task created & delegated"
              : "Task created";

      toast({
        title: dispositionLabel,
        description: `Processed: ${currentItem.content.slice(0, 60)}${currentItem.content.length > 60 ? "..." : ""}`,
      });

      // Move to next item
      setProcessedCount((prev) => prev + 1);
      const newItems = items.filter((_, i) => i !== currentIndex);
      setItems(newItems);
      // Keep the same index (which now points to the next item) or wrap
      if (currentIndex >= newItems.length) {
        setCurrentIndex(0);
      }
      resetWizard();
    } catch {
      toast({
        title: "Error",
        description: "Failed to process item. Please try again.",
        variant: "destructive",
      });
    }

    setProcessing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // All done state
  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/inbox">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Inbox
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">All done!</h2>
            <p className="text-muted-foreground mb-1">
              {processedCount > 0
                ? `You processed ${processedCount} item${processedCount !== 1 ? "s" : ""}. Your inbox is clear.`
                : "Your inbox is empty. Nothing to process."}
            </p>
            <p className="text-sm text-muted-foreground">
              Capture new items with{" "}
              <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">
                Cmd+I
              </kbd>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/inbox">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Inbox
            </Button>
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Process Inbox
            <HelpLink slug="clarify" />
          </h1>
        </div>
        <Badge variant="outline" className="text-sm">
          {processedCount} of {totalItems} processed
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all duration-300"
          style={{
            width: `${totalItems > 0 ? (processedCount / totalItems) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <StepIndicator
          number={1}
          label="Review"
          active={step === "review"}
          completed={step !== "review"}
        />
        <span className="text-muted-foreground/50">---</span>
        <StepIndicator
          number={2}
          label="Decide"
          active={step === "not_actionable" || step === "actionable"}
          completed={step === "confirm"}
        />
        <span className="text-muted-foreground/50">---</span>
        <StepIndicator
          number={3}
          label="Confirm"
          active={step === "confirm"}
          completed={false}
        />
      </div>

      {/* Steps */}
      {step === "review" && (
        <ProcessingStep1
          item={currentItem}
          onActionable={handleActionable}
          onNotActionable={handleNotActionable}
        />
      )}

      {step === "not_actionable" && (
        <ProcessingStep2a
          inboxContent={currentItem.content}
          inboxNotes={currentItem.notes}
          onBack={() => setStep("review")}
          onConfirm={handleNotActionableConfirm}
        />
      )}

      {step === "actionable" && (
        <ProcessingStep2b
          inboxContent={currentItem.content}
          onBack={() => setStep("review")}
          onConfirm={handleActionableConfirm}
        />
      )}

      {step === "confirm" && (
        <ProcessingStep3
          inboxContent={currentItem.content}
          decision={decision}
          notActionableData={notActionableData || undefined}
          actionableData={actionableData || undefined}
          onBack={handleBack}
          onProcess={handleProcess}
          processing={processing}
          totalItems={totalItems}
          processedCount={processedCount}
        />
      )}
    </div>
  );
}

function StepIndicator({
  number,
  label,
  active,
  completed,
}: {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`
          h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium
          ${
            active
              ? "bg-primary text-primary-foreground"
              : completed
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
          }
        `}
      >
        {completed ? (
          <CheckCircle className="h-3 w-3" />
        ) : (
          number
        )}
      </div>
      <span className={active ? "text-foreground font-medium" : ""}>
        {label}
      </span>
    </div>
  );
}
