"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Bot,
  ClipboardCheck,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { StepIndicatorBar } from "./ReviewStep";
import { GetClearStep } from "./steps/GetClearStep";
import { GetCurrentStep } from "./steps/GetCurrentStep";
import { GetCreativeStep } from "./steps/GetCreativeStep";
import { ReviewAICoach } from "./ReviewAICoach";
import { parseSSEEvents } from "@/lib/ai/parse-sse";

interface Review {
  id: string;
  status: string;
  weekOf: string;
  notes: string | null;
  checklist: {
    getClear?: boolean;
    getCurrent?: boolean;
    getCreative?: boolean;
  } | null;
  completedAt: string | null;
  createdAt: string;
}

type ReviewPhase = "getClear" | "getCurrent" | "getCreative";

const STEP_TO_PHASE: Record<number, ReviewPhase> = {
  0: "getClear",
  1: "getCurrent",
  2: "getCreative",
};

export function ReviewWizard() {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepNotes, setStepNotes] = useState<Record<number, string>>({
    0: "",
    1: "",
    2: "",
  });
  const [aiCoachEnabled, setAiCoachEnabled] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [mobileCoachOpen, setMobileCoachOpen] = useState(false);

  // Summary generation state
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);

  const { toast } = useToast();

  // Check if AI chat is available
  useEffect(() => {
    async function checkAI() {
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: "test" }],
          }),
        });
        // If we get anything other than 403, AI is available
        // (even 429 means it's configured but rate-limited)
        setAiAvailable(res.status !== 403);
      } catch {
        setAiAvailable(false);
      }
    }
    checkAI();
  }, []);

  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews/current");
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setReview(data);
          // Restore step from checklist
          const checklist = data.checklist || {};
          if (checklist.getCreative) {
            setCurrentStep(2); // All done, on last step
          } else if (checklist.getCurrent) {
            setCurrentStep(2);
          } else if (checklist.getClear) {
            setCurrentStep(1);
          } else {
            setCurrentStep(0);
          }
          // Parse existing notes into step notes if present
          if (data.notes) {
            try {
              const parsed = JSON.parse(data.notes);
              if (typeof parsed === "object" && parsed !== null) {
                setStepNotes({
                  0: parsed.getClear || "",
                  1: parsed.getCurrent || "",
                  2: parsed.getCreative || "",
                });
              }
            } catch {
              // Notes might be plain text, not JSON
              setStepNotes({ 0: data.notes, 1: "", 2: "" });
            }
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
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        setReview(data);
        setCurrentStep(0);
        setStepNotes({ 0: "", 1: "", 2: "" });
        toast({ title: "Weekly review started" });
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

  async function saveProgress(stepChecklist: Record<string, boolean>) {
    if (!review) return;
    setSaving(true);

    // Build combined notes as JSON
    const notesPayload = JSON.stringify({
      getClear: stepNotes[0] || "",
      getCurrent: stepNotes[1] || "",
      getCreative: stepNotes[2] || "",
    });

    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesPayload,
          checklist: stepChecklist,
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

  async function handleStepComplete(step: number) {
    const checklistUpdates: Record<string, boolean> = {};
    if (step === 0) checklistUpdates.getClear = true;
    if (step === 1) checklistUpdates.getCurrent = true;
    if (step === 2) checklistUpdates.getCreative = true;

    await saveProgress(checklistUpdates);

    if (step < 2) {
      setCurrentStep(step + 1);
      toast({
        title: `Step ${step + 1} complete`,
        description: `Moving to step ${step + 2} of 3`,
      });
    } else {
      // Final step — if AI was used, offer summary generation
      if (aiCoachEnabled) {
        setShowSummary(true);
      } else {
        await completeReview();
      }
    }
  }

  async function generateSummary() {
    if (!review) return;
    setGeneratingSummary(true);
    setSummaryText("");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "Generate my weekly review summary.",
            },
          ],
          context: "REVIEW_MODE:summary",
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to generate summary");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const parsed = parseSSEEvents(chunk);
        if (parsed.text) {
          fullText += parsed.text;
          setSummaryText(fullText);
        }
        if (parsed.done) break;
      }
    } catch {
      toast({
        title: "Failed to generate summary",
        description: "You can still complete the review without a summary.",
        variant: "destructive",
      });
    }
    setGeneratingSummary(false);
  }

  async function saveSummaryAndComplete() {
    if (!review) return;
    setSavingSummary(true);

    try {
      // Save the AI summary to the review
      const patchRes = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiSummary: summaryText,
          aiCoachUsed: true,
        }),
      });

      if (!patchRes.ok) {
        toast({
          title: "Failed to save summary",
          variant: "destructive",
        });
        setSavingSummary(false);
        return;
      }

      // Complete the review
      await completeReview();
    } catch {
      toast({
        title: "Failed to save summary",
        variant: "destructive",
      });
    }
    setSavingSummary(false);
  }

  async function completeReview() {
    if (!review) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/reviews/${review.id}/complete`, {
        method: "POST",
      });

      if (res.ok) {
        setReview(null);
        setCurrentStep(0);
        setStepNotes({ 0: "", 1: "", 2: "" });
        setShowSummary(false);
        setSummaryText("");
        setAiCoachEnabled(false);
        toast({
          title: "Weekly review complete!",
          description: "Great job. You're in control of your commitments.",
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
  const completedSteps = [
    !!checklist.getClear,
    !!checklist.getCurrent,
    !!checklist.getCreative,
  ];

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
        <CardContent className="py-12 text-center">
          <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Start Your Weekly Review</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            The weekly review is the critical success factor for GTD. Walk through
            three steps to get clear, get current, and get creative.
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
                Begin Weekly Review
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Summary generation screen
  if (showSummary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-sm">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            AI Review Summary
          </Badge>
        </div>

        <Card>
          <CardContent className="py-6 space-y-4">
            {!summaryText && !generatingSummary && (
              <div className="text-center py-6">
                <Bot className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  Generate an AI summary of your weekly review before completing.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={generateSummary}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Summary
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => completeReview()}
                    disabled={saving}
                  >
                    Skip & Complete
                  </Button>
                </div>
              </div>
            )}

            {generatingSummary && !summaryText && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Generating summary...
                </span>
              </div>
            )}

            {summaryText && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Review Summary
                    <span className="text-muted-foreground font-normal ml-1">
                      (editable)
                    </span>
                  </label>
                  <Textarea
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                    disabled={generatingSummary}
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={generateSummary}
                    disabled={generatingSummary || savingSummary}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                  <Button
                    onClick={saveSummaryAndComplete}
                    disabled={savingSummary || generatingSummary}
                  >
                    {savingSummary ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save & Complete Review"
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPhase = STEP_TO_PHASE[currentStep];

  // Step content component
  const stepContent = (
    <>
      {currentStep === 0 && (
        <GetClearStep
          notes={stepNotes[0]}
          onNotesChange={(val) =>
            setStepNotes((prev) => ({ ...prev, 0: val }))
          }
          onMarkComplete={() => handleStepComplete(0)}
          saving={saving}
        />
      )}

      {currentStep === 1 && (
        <GetCurrentStep
          notes={stepNotes[1]}
          onNotesChange={(val) =>
            setStepNotes((prev) => ({ ...prev, 1: val }))
          }
          onMarkComplete={() => handleStepComplete(1)}
          onBack={handleBack}
          saving={saving}
        />
      )}

      {currentStep === 2 && (
        <GetCreativeStep
          notes={stepNotes[2]}
          onNotesChange={(val) =>
            setStepNotes((prev) => ({ ...prev, 2: val }))
          }
          onMarkComplete={() => handleStepComplete(2)}
          onBack={handleBack}
          saving={saving}
        />
      )}
    </>
  );

  // Active review — show wizard
  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-sm">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Review in progress
        </Badge>
        <div className="flex items-center gap-3">
          {aiAvailable && (
            <>
              {/* Mobile AI Coach toggle */}
              {aiCoachEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setMobileCoachOpen(true)}
                >
                  <Bot className="h-3.5 w-3.5 mr-1.5" />
                  Coach
                </Button>
              )}
              <Button
                variant={aiCoachEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAiCoachEnabled(!aiCoachEnabled)}
              >
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                AI Coach {aiCoachEnabled ? "ON" : "OFF"}
              </Button>
            </>
          )}
          <span className="text-sm text-muted-foreground">
            Step {currentStep + 1} of 3
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all duration-500"
          style={{
            width: `${(completedSteps.filter(Boolean).length / 3) * 100}%`,
          }}
        />
      </div>

      {/* Step indicators */}
      <StepIndicatorBar
        currentStep={currentStep}
        totalSteps={3}
        completedSteps={completedSteps}
      />

      {/* Step content — side by side with AI coach on desktop */}
      {aiCoachEnabled ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>{stepContent}</div>
            <div className="hidden lg:block h-[600px]">
              <ReviewAICoach
                phase={currentPhase}
                reviewId={review.id}
              />
            </div>
          </div>

          {/* Mobile AI Coach Sheet */}
          <Sheet open={mobileCoachOpen} onOpenChange={setMobileCoachOpen}>
            <SheetContent side="bottom" className="h-[80vh] p-0 lg:hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>AI Review Coach</SheetTitle>
                <SheetDescription>AI-powered weekly review assistant</SheetDescription>
              </SheetHeader>
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Review Coach</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setMobileCoachOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <ReviewAICoach
                    phase={currentPhase}
                    reviewId={review.id}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        stepContent
      )}
    </div>
  );
}
