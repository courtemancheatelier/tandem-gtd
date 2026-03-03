"use client";

import { useState } from "react";
import { ProjectHealthWidget } from "./ProjectHealthWidget";

import { BurnDownWidget } from "./BurnDownWidget";
import { VelocityWidget } from "./VelocityWidget";
import { BlockedQueueWidget } from "./BlockedQueueWidget";
import { StaleProjectsWidget } from "./StaleProjectsWidget";
import { MilestonesWidget } from "./MilestonesWidget";
import { RecentActivityWidget } from "./RecentActivityWidget";
import { GtdHealthPulse } from "./GtdHealthPulse";
import { HorizonAlignmentWidget } from "./HorizonAlignmentWidget";
import { StuckProjectsDetailWidget } from "./StuckProjectsDetailWidget";
import { WaitingForWidget } from "./WaitingForWidget";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DashboardStatsResponse {
  projectHealth: {
    id: string;
    title: string;
    status: "GREEN" | "YELLOW" | "RED";
    rollupProgress: number;
    overdueCount: number;
    blockedCount: number;
    totalTasks: number;
    staleNextActions: number;
  }[];
  projectProgress: {
    id: string;
    title: string;
    rollupProgress: number;
    tasksDone: number;
    tasksTotal: number;
    children: {
      id: string;
      title: string;
      rollupProgress: number;
      tasksDone: number;
      tasksTotal: number;
    }[];
  }[];
  burnDown: {
    data: { date: string; remaining: number; ideal: number }[];
    totalEstimate: number;
  };
  velocity: {
    data: { week: string; completedCount: number; completedMins: number }[];
    averagePerWeek: number;
    averageMinsPerWeek: number;
    lookbackWeeks: number;
    trend: { direction: "up" | "down"; percent: number } | null;
  };
  blockedTasks: {
    id: string;
    title: string;
    projectId: string | null;
    projectTitle: string | null;
    blockedBy: { id: string; title: string; status: string }[];
  }[];
  staleProjects: {
    id: string;
    title: string;
    status: string;
    daysSinceActivity: number;
    lastActivityDate: string;
  }[];
  upcomingMilestones: {
    id: string;
    title: string;
    dueDate: string;
    projectId: string | null;
    projectTitle: string | null;
    status: string;
    daysUntilDue: number;
  }[];
  gtdHealth?: {
    inboxCount: number;
    daysSinceReview: number | null;
    lastReviewDate: string | null;
    stuckProjects: { id: string; title: string; totalTasks: number }[];
    cascade: {
      thisWeek: number;
      lastWeek: number;
      sparkline: { week: string; count: number }[];
    };
  };
  horizonAlignment?: {
    areas: { id: string; name: string; projectCount: number; goalCount: number }[];
    disconnectedProjectCount: number;
    orphanGoals: { id: string; title: string }[];
  };
}

export type { DashboardStatsResponse };

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 mb-2 group cursor-pointer"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
          {title}
        </h2>
      </button>
      {open && children}
    </section>
  );
}

interface DashboardGridProps {
  data: DashboardStatsResponse;
  onVelocityLookbackChange?: (weeks: number) => void;
}

export function DashboardGrid({ data, onVelocityLookbackChange }: DashboardGridProps) {
  return (
    <div className="space-y-5">
      {/* Tier 1: GTD Health (always visible) */}
      {data.gtdHealth && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            GTD Health
          </h2>
          <GtdHealthPulse data={data.gtdHealth} />
        </section>
      )}

      {/* Tier 2: Projects & Alignment */}
      <CollapsibleSection title="Projects & Alignment">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {data.horizonAlignment && (
            <HorizonAlignmentWidget data={data.horizonAlignment} />
          )}
          <ProjectHealthWidget data={data.projectHealth} progressData={data.projectProgress} />
        </div>
      </CollapsibleSection>

      {/* Tier 3: Needs Attention */}
      <CollapsibleSection title="Needs Attention">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {data.gtdHealth && (
            <StuckProjectsDetailWidget data={data.gtdHealth.stuckProjects} />
          )}
          <BlockedQueueWidget data={data.blockedTasks} />
          <StaleProjectsWidget data={data.staleProjects} />
          <WaitingForWidget />
        </div>
        {data.upcomingMilestones.length > 0 && (
          <div className="mt-4">
            <MilestonesWidget data={data.upcomingMilestones} />
          </div>
        )}
      </CollapsibleSection>

      {/* Tier 4: Performance */}
      <CollapsibleSection title="Performance" defaultOpen={false}>
        <div className="space-y-4">
          <BurnDownWidget data={data.burnDown} velocity={data.velocity} />
          <VelocityWidget data={data.velocity} onLookbackChange={onVelocityLookbackChange} />
        </div>
      </CollapsibleSection>

      {/* Recent Activity */}
      <CollapsibleSection title="Recent Activity" defaultOpen={false}>
        <RecentActivityWidget />
      </CollapsibleSection>
    </div>
  );
}
