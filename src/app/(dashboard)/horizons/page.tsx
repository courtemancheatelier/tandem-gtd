"use client";

import { useEffect, useState, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Mountain } from "lucide-react";
import {
  Compass,
  Target,
  Layers,
  FolderKanban,
  CheckSquare,
  Sparkles,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { HelpLink } from "@/components/shared/HelpLink";
import { HorizonCard, type HorizonConfig } from "@/components/horizons/HorizonCard";
import type { GoalData } from "@/components/horizons/GoalList";
import type { AreaData } from "@/components/areas/AreaCard";

interface HorizonNoteData {
  id: string;
  level: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const HORIZONS: HorizonConfig[] = [
  {
    level: "HORIZON_5",
    altitude: "50,000ft",
    name: "Life Purpose",
    description:
      "Your ultimate purpose, core values, and guiding principles. What gives your life meaning?",
    icon: <Compass className="h-5 w-5" />,
    hint: `Ask: Why do I exist? What principles guide every decision I make?\n\nGood: "To create meaningful human connection through art and movement."\nBad: "Be successful" — too vague, that's more of a vision.`,
  },
  {
    level: "HORIZON_4",
    altitude: "40,000ft",
    name: "Vision",
    description:
      "3-5 year outcomes. What does your ideal life look like? Career, relationships, lifestyle.",
    icon: <Mountain className="h-5 w-5" />,
    hint: `Ask: If everything went well, what does my life look like in 3-5 years?\n\nGood: "Running my own atelier, dancing tango weekly, financially independent."\nBad: "Save $50k by December" — too specific, that's a goal.`,
  },
  {
    level: "HORIZON_3",
    altitude: "30,000ft",
    name: "Goals",
    description:
      "1-2 year specific, measurable objectives. What do you want to achieve in the near term?",
    icon: <Target className="h-5 w-5" />,
    showGoals: true,
    hint: `Ask: What specific, measurable outcome do I want in 1-2 years?\n\nGood: "Save $50k by Dec 2027" or "Travel internationally twice this year"\nBad: "Be healthier" — not measurable. Try "Run a half marathon by October."`,
  },
  {
    level: "HORIZON_2",
    altitude: "20,000ft",
    name: "Areas of Responsibility",
    description:
      "Ongoing areas you need to maintain at a standard. Health, finances, career, relationships.",
    icon: <Layers className="h-5 w-5" />,
    showAreas: true,
    linkTo: "/areas",
    linkLabel: "Manage all areas (reorder, archive)",
    hint: `Ask: What would fall apart if I ignored it for 3 months? These never "complete."\n\nGood: "Health & Fitness", "Finances", "Career Development"\nBad: "Travel" — that's a goal or project, not an ongoing responsibility.`,
  },
  {
    level: "HORIZON_1",
    altitude: "10,000ft",
    name: "Current Projects",
    description:
      "Multi-step outcomes you are committed to completing. Projects support your goals and areas.",
    icon: <FolderKanban className="h-5 w-5" />,
    linkTo: "/projects",
    linkLabel: "View Active Projects",
    hint: `Ask: What multi-step outcome am I committed to finishing?\n\nGood: "Trip to Japan", "Redesign portfolio website"\nBad: "Health" — that's an area. "Learn Japanese" — too open-ended, make it a goal.`,
  },
  {
    level: "RUNWAY",
    altitude: "Ground",
    name: "Current Actions",
    description:
      "The runway of your day-to-day life. All the next actions and tasks on your lists right now.",
    icon: <CheckSquare className="h-5 w-5" />,
    linkTo: "/do-now",
    linkLabel: "Go to Do Now",
    hint: `Ask: What is the very next physical action I can take?\n\nGood: "Call dentist to schedule cleaning", "Draft email to venue"\nBad: "Plan trip" — too vague. What's the next action? "Research flights to Tokyo."`,
  },
];

interface HorizonReviewData {
  id: string;
  type: string;
  status: string;
  completedAt: string | null;
}

export default function HorizonsPage() {
  const [notes, setNotes] = useState<HorizonNoteData[]>([]);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [latestReview, setLatestReview] = useState<HorizonReviewData | null>(null);
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [expandedLevel, setExpandedLevel] = useState<string | null>("HORIZON_3");
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    const res = await fetch("/api/horizon-notes");
    if (res.ok) {
      setNotes(await res.json());
    }
  }, []);

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals?horizon=HORIZON_3");
    if (res.ok) {
      setGoals(await res.json());
    }
  }, []);

  const fetchAreas = useCallback(async () => {
    const res = await fetch("/api/areas");
    if (res.ok) {
      setAreas(await res.json());
    }
  }, []);

  const fetchReviewData = useCallback(async () => {
    try {
      // Fetch latest completed review
      const latestRes = await fetch("/api/horizon-reviews/latest");
      if (latestRes.ok) {
        const data = await latestRes.json();
        if (data && data.id) {
          setLatestReview(data);
        }
      }
      // Check if initial setup has been completed
      const reviewsRes = await fetch("/api/horizon-reviews?type=INITIAL_SETUP&limit=1");
      if (reviewsRes.ok) {
        const data = await reviewsRes.json();
        const completedSetup = data.reviews?.some(
          (r: HorizonReviewData) => r.status === "COMPLETED"
        );
        setHasCompletedSetup(!!completedSetup);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchNotes(), fetchGoals(), fetchAreas(), fetchReviewData()]).finally(() =>
      setLoading(false)
    );
  }, [fetchNotes, fetchGoals, fetchAreas, fetchReviewData]);

  function getNoteForLevel(level: string): HorizonNoteData | null {
    return notes.find((n) => n.level === level) || null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine banner state
  const showSetupBanner = notes.length === 0 && !hasCompletedSetup;
  const daysSinceReview = latestReview?.completedAt
    ? Math.floor(
        (Date.now() - new Date(latestReview.completedAt).getTime()) / 86400000
      )
    : null;
  // Show overdue banner if: not showing setup banner, AND (no completed review ever, or last review >90 days ago)
  const showOverdueBanner = !showSetupBanner && (daysSinceReview === null || daysSinceReview > 90);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mountain className="h-6 w-6" />
          Horizons of Focus
          <HelpLink slug="horizons-of-focus" />
        </h1>
        <p className="text-muted-foreground mt-1">
          The six levels of perspective in GTD — from life purpose down to daily actions
        </p>
      </div>

      <Separator />

      {/* Setup banner */}
      {showSetupBanner && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">New here? Set up your horizons</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Take 15 minutes to define your purpose, vision, goals, and areas of focus.
                  </p>
                </div>
              </div>
              <Link href="/horizons/setup">
                <Button size="sm">
                  Start Setup
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overdue review banner */}
      {showOverdueBanner && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h3 className="font-medium">Quarterly check-in recommended</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {daysSinceReview
                      ? `It's been ${daysSinceReview} days since your last horizons review.`
                      : "You haven't done a horizons review yet."}{" "}
                    A quarterly review keeps your system aligned.
                  </p>
                </div>
              </div>
              <Link href="/horizons/review?type=quarterly">
                <Button variant="outline" size="sm">
                  Start Review
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {HORIZONS.map((config) => (
          <HorizonCard
            key={config.level}
            config={config}
            note={getNoteForLevel(config.level)}
            goals={config.showGoals ? goals : undefined}
            areas={config.showAreas ? areas : undefined}
            onNoteSaved={fetchNotes}
            onGoalsRefresh={fetchGoals}
            onAreasRefresh={config.showAreas ? fetchAreas : undefined}
            expanded={expandedLevel === config.level}
            onToggle={() =>
              setExpandedLevel(expandedLevel === config.level ? null : config.level)
            }
          />
        ))}
      </div>
    </div>
  );
}
