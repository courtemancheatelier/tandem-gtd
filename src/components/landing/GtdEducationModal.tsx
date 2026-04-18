"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const STORAGE_KEY = "tandem_gtd_intro_seen";

const slides = [
  {
    headline: "Your brain is for having ideas, not holding them.",
    body: (
      <>
        <p>
          Getting Things Done (GTD) is a personal productivity method created by
          David Allen. The core insight is simple: your brain is terrible at
          storing to-do lists, but excellent at solving problems — if it
          isn&apos;t simultaneously trying to remember everything you&apos;re
          supposed to do.
        </p>
        <p className="mt-3">
          GTD gives you a trusted external system to hold all your commitments,
          so your mind stays clear.
        </p>
      </>
    ),
  },
  {
    headline: 'The "I should really..." feeling has a name.',
    body: (
      <>
        <p>
          You know that low-level background anxiety — the sense that you&apos;re
          forgetting something, or that you&apos;re working on the wrong thing?
          GTD calls that an &ldquo;open loop&rdquo;: a commitment you&apos;ve
          made to yourself that isn&apos;t captured anywhere your brain trusts.
        </p>
        <p className="mt-3">
          Every unmade dentist appointment, unfinished project, or unanswered
          email is an open loop quietly draining your attention.
        </p>
        <p className="mt-3">
          GTD closes the loops — not by doing everything at once, but by giving
          every commitment a proper home.
        </p>
      </>
    ),
  },
  {
    headline: 'A to-do list asks "what?" GTD asks "what next?"',
    body: (
      <>
        <p>
          Most to-do apps give you a place to write &ldquo;Bathroom
          renovation.&rdquo; GTD asks you to define the{" "}
          <em>next physical action</em> — the one specific thing you could do
          today to move it forward.
        </p>
        <p className="mt-3">
          &ldquo;Bathroom renovation&rdquo; isn&apos;t actionable.
          &ldquo;Search tile prices on Home Depot&rdquo; is.
        </p>
        <p className="mt-3">
          GTD also organizes by <strong>context</strong> — where you are, what
          tools you have, how much energy you have. So when you&apos;re at a
          hardware store with 20 minutes, you see exactly what you can do right
          now.
        </p>
      </>
    ),
  },
  {
    headline: "It's a workflow, not just a list.",
    body: (
      <>
        <p>GTD is a five-step cycle you run continuously:</p>
        <ol className="mt-3 space-y-2 list-decimal list-inside">
          <li>
            <strong>Capture</strong> — Get everything out of your head into an
            inbox
          </li>
          <li>
            <strong>Clarify</strong> — Decide what each item is and what to do
            about it
          </li>
          <li>
            <strong>Organize</strong> — Put it where it belongs: calendar, action
            list, reference, or trash
          </li>
          <li>
            <strong>Reflect</strong> — Review your system regularly so it stays
            trusted
          </li>
          <li>
            <strong>Engage</strong> — Choose what to work on with confidence, not
            anxiety
          </li>
        </ol>
        <p className="mt-3">
          The magic is in the system you build and the habit of maintaining it —
          not in any single piece.
        </p>
      </>
    ),
  },
  {
    headline: "A GTD app that thinks in GTD.",
    body: (
      <>
        <p>
          Most productivity apps bolt GTD terminology onto a generic task list.
          Tandem was built from the ground up around the methodology — including
          the parts most apps skip.
        </p>
        <ul className="mt-3 space-y-2 list-disc list-inside">
          <li>
            When you complete a task, Tandem automatically surfaces what&apos;s
            next — you don&apos;t hunt for it
          </li>
          <li>
            Your context filters are the primary work surface, not a buried
            feature
          </li>
          <li>
            The Weekly Review is guided and interactive, not just a reminder to
            do one
          </li>
          <li>
            Your data lives on your server. GTD is an intimate map of your mind —
            it belongs to you
          </li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          You don&apos;t have to know GTD deeply to start. Tandem grows with you.
        </p>
      </>
    ),
  },
];

interface GtdEducationModalProps {
  showSignup: boolean;
  isTrial: boolean;
}

export function GtdEducationTrigger({ showSignup, isTrial }: GtdEducationModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        <HelpCircle className="h-4 w-4" />
        New to GTD?
      </button>
      {isOpen && (
        <GtdEducationModal
          onClose={() => setIsOpen(false)}
          showSignup={showSignup}
          isTrial={isTrial}
        />
      )}
    </>
  );
}

function GtdEducationModal({
  onClose,
  showSignup,
  isTrial,
}: {
  onClose: () => void;
  showSignup: boolean;
  isTrial: boolean;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const isLastSlide = currentSlide === slides.length - 1;

  const handleClose = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage unavailable
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && currentSlide < slides.length - 1)
        setCurrentSlide((s) => s + 1);
      if (e.key === "ArrowLeft" && currentSlide > 0)
        setCurrentSlide((s) => s - 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, handleClose]);

  // Mark as seen when reaching last slide
  useEffect(() => {
    if (isLastSlide) {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // localStorage unavailable
      }
    }
  }, [isLastSlide]);

  const slide = slides[currentSlide];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl bg-background border shadow-2xl p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Slide content */}
        <div className="pr-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {currentSlide + 1} of {slides.length}
          </p>
          <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
            {slide.headline}
          </h2>
          <div className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
            {slide.body}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {/* Step indicators */}
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentSlide
                    ? "bg-foreground"
                    : i <= currentSlide
                      ? "bg-foreground/40"
                      : "bg-foreground/15"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Prev / Next buttons */}
          <div className="flex gap-2">
            {currentSlide > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentSlide((s) => s - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            {isLastSlide ? (
              <div className="flex gap-2">
                {showSignup && (
                  <Button size="sm" asChild>
                    <Link href="/login">
                      {isTrial ? "Try Tandem Free" : "Get Started"}
                    </Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Back to Tandem
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setCurrentSlide((s) => s + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
