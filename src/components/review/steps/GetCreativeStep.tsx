"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Lightbulb,
  Sparkles,
  Mountain,
  ListChecks,
  ExternalLink,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

interface GetCreativeStepProps {
  notes: string;
  onNotesChange: (notes: string) => void;
  onMarkComplete: () => void;
  onBack: () => void;
  saving: boolean;
}

interface SomedayProject {
  id: string;
  title: string;
  status: string;
}

interface HorizonReviewInfo {
  completedAt: string;
  type: string;
}

const creativePrompts = [
  {
    id: "someday",
    label: "Review someday/maybe list -- promote or remove any?",
    icon: ListChecks,
  },
  {
    id: "horizons",
    label: "Review horizons of focus -- are you aligned with your purpose?",
    icon: Mountain,
  },
  {
    id: "new_projects",
    label: "Any new projects or commitments to capture?",
    icon: Sparkles,
  },
  {
    id: "creative_ideas",
    label: "Any creative ideas or inspirations to note?",
    icon: Lightbulb,
  },
];

export function GetCreativeStep({
  notes,
  onNotesChange,
  onMarkComplete,
  onBack,
  saving,
}: GetCreativeStepProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [somedayProjects, setSomedayProjects] = useState<SomedayProject[]>([]);
  const [lastHorizonReview, setLastHorizonReview] = useState<HorizonReviewInfo | null>(null);
  const [horizonReviewLoaded, setHorizonReviewLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectsRes, horizonRes] = await Promise.all([
          fetch("/api/projects?status=SOMEDAY_MAYBE"),
          fetch("/api/horizon-reviews/latest"),
        ]);
        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setSomedayProjects(Array.isArray(data) ? data : []);
        }
        if (horizonRes.ok) {
          const data = await horizonRes.json();
          if (data && data.id) {
            setLastHorizonReview(data);
          }
        }
        setHorizonReviewLoaded(true);
      } catch {
        // Silently fail
        setHorizonReviewLoaded(true);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const daysSinceHorizonReview = lastHorizonReview
    ? Math.floor(
        (Date.now() - new Date(lastHorizonReview.completedAt).getTime()) / 86400000
      )
    : null;
  const horizonOverdue = daysSinceHorizonReview === null || daysSinceHorizonReview > 90;

  function toggleItem(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const allChecked = creativePrompts.every((item) => checkedItems[item.id]);

  return (
    <div className="space-y-4">
      {/* Someday/maybe overview */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              Someday / Maybe
            </h4>
            <Link href="/projects">
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View All
              </Button>
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : somedayProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No someday/maybe projects. Consider adding ideas you want to revisit later.
            </p>
          ) : (
            <div className="space-y-2">
              {somedayProjects.slice(0, 8).map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block text-sm py-1.5 px-2 rounded-md hover:bg-muted transition-colors"
                >
                  {project.title}
                </Link>
              ))}
              {somedayProjects.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {somedayProjects.length - 8} more in someday/maybe
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Horizons of focus prompt — with review nudge */}
      <Card className={horizonReviewLoaded && horizonOverdue ? "border-amber-500/30" : ""}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            {horizonReviewLoaded && horizonOverdue ? (
              <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            ) : (
              <Mountain className="h-5 w-5 text-muted-foreground mt-0.5" />
            )}
            <div>
              <h4 className="font-medium">Horizons of Focus</h4>
              {horizonReviewLoaded && daysSinceHorizonReview === null ? (
                <>
                  <p className="text-sm text-muted-foreground mt-1">
                    You haven&apos;t set up your horizons yet. Take 15 minutes to define
                    your purpose, vision, and goals.
                  </p>
                  <Link href="/horizons/setup">
                    <Button size="sm" className="mt-3">
                      Start Setup
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </>
              ) : horizonReviewLoaded && horizonOverdue ? (
                <>
                  <p className="text-sm text-muted-foreground mt-1">
                    It&apos;s been {daysSinceHorizonReview} days since your last horizons review.
                    A quarterly check-in keeps your system aligned.
                  </p>
                  <Link href="/horizons/review?type=quarterly">
                    <Button variant="outline" size="sm" className="mt-3">
                      Start Quarterly Review
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mt-1">
                    Horizons reviewed {daysSinceHorizonReview} day{daysSinceHorizonReview !== 1 ? "s" : ""} ago.
                    Take a moment to consider the bigger picture.
                  </p>
                  <Link href="/horizons">
                    <Button variant="outline" size="sm" className="mt-3">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Review Horizons
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Creative prompts checklist */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-3">Creative Thinking Prompts</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Step back from the day-to-day. Let your mind wander and capture any new ideas.
          </p>
          <div className="space-y-3">
            {creativePrompts.map((item) => {
              const Icon = item.icon;
              return (
                <label
                  key={item.id}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <Checkbox
                    checked={!!checkedItems[item.id]}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span
                    className={`text-sm ${
                      checkedItems[item.id]
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                </label>
              );
            })}
          </div>
          {allChecked && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              All prompts considered
            </div>
          )}
        </CardContent>
      </Card>

      {/* Free-form notes */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Free-form Notes
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            Capture any new ideas, projects, goals, or creative thoughts from this review.
          </p>
          <Textarea
            placeholder="New ideas, projects to start, goals to set, creative thoughts..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={5}
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={onMarkComplete} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Complete Review
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
