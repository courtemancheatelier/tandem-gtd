"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, ExternalLink, HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { HorizonNote } from "./HorizonNote";
import { GoalList, type GoalData } from "./GoalList";
import { AreaList } from "./AreaList";
import type { AreaData } from "@/components/areas/AreaCard";
import Link from "next/link";

interface HorizonNoteData {
  id: string;
  level: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface HorizonConfig {
  level: string;
  altitude: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  linkTo?: string;
  linkLabel?: string;
  showGoals?: boolean;
  showAreas?: boolean;
  hint?: string;
}

interface HorizonCardProps {
  config: HorizonConfig;
  note: HorizonNoteData | null;
  goals?: GoalData[];
  areas?: AreaData[];
  onNoteSaved: () => void;
  onGoalsRefresh: () => void;
  onAreasRefresh?: () => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function HorizonCard({
  config,
  note,
  goals = [],
  areas = [],
  onNoteSaved,
  onGoalsRefresh,
  onAreasRefresh,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
}: HorizonCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpanded = onToggle || (() => setInternalExpanded(!internalExpanded));
  const [notesExpanded, setNotesExpanded] = useState(!config.showGoals && !config.showAreas && !config.linkTo);

  const hasContent = !!note?.content || (config.showGoals && goals.length > 0) || (config.showAreas && areas.length > 0);

  return (
    <Card className={cn("transition-all", expanded && "ring-1 ring-ring/20")}>
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={toggleExpanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="shrink-0 text-muted-foreground">{config.icon}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">
                  {config.altitude}
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  {config.name}
                </span>
              </div>
              {!expanded && (
                <CardDescription className="text-xs truncate mt-0.5">
                  {config.description}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {config.showGoals && goals.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {goals.filter((g) => g.status !== "ACHIEVED" && g.status !== "DEFERRED").length} active
              </span>
            )}
            {config.showAreas && areas.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {areas.filter((a) => a.isActive).length} active
              </span>
            )}
            {hasContent && !expanded && (
              <div className="h-2 w-2 rounded-full bg-primary/40" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded();
              }}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 space-y-4">
          <div className="flex items-start gap-1.5">
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {config.hint && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 mt-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="text-xs whitespace-pre-line">
                  {config.hint}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Link to related page */}
          {config.linkTo && (
            <Link
              href={config.linkTo}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {config.linkLabel || `Go to ${config.name}`}
            </Link>
          )}

          {/* Goals section for Horizon 3 */}
          {config.showGoals && (
            <>
              <Separator />
              <GoalList goals={goals} onRefresh={onGoalsRefresh} />
            </>
          )}

          {/* Areas section for Horizon 2 */}
          {config.showAreas && onAreasRefresh && (
            <>
              <Separator />
              <AreaList areas={areas} onRefresh={onAreasRefresh} />
            </>
          )}

          {/* Notes section — collapsible */}
          <Separator />
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              onClick={() => setNotesExpanded(!notesExpanded)}
            >
              {notesExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Notes & Reflections
              {!notesExpanded && note?.content && (
                <span className="text-muted-foreground/50 font-normal truncate ml-1">
                  — {note.content.slice(0, 60)}{note.content.length > 60 ? "..." : ""}
                </span>
              )}
            </button>
            {notesExpanded && (
              <div className="mt-2">
                <HorizonNote
                  level={config.level}
                  note={note}
                  onSaved={onNoteSaved}
                />
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
