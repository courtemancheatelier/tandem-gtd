"use client";

import { useState } from "react";
import { ThroughputWidget } from "./ThroughputWidget";
import { CycleTimeWidget } from "./CycleTimeWidget";
import { TimeInStatusWidget } from "./TimeInStatusWidget";
import { SourceDistributionWidget } from "./SourceDistributionWidget";
import { ContextEnergyWidget } from "./ContextEnergyWidget";
import { InboxThroughputWidget } from "./InboxThroughputWidget";
import { InboxFunnelWidget } from "./InboxFunnelWidget";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface InsightsData {
  timeInStatus: {
    status: string;
    avgHours: number;
    medianHours: number;
    count: number;
  }[];
  cycleTime: {
    trend: { week: string; avgHours: number; count: number }[];
    byContext: { context: string; avgHours: number; count: number }[];
    byEnergy: { energy: string; avgHours: number; count: number }[];
  };
  sources: { source: string; count: number; percentage: number }[];
  contextCompletions: { context: string; count: number }[];
  energyCompletions: { energy: string; count: number }[];
  throughput: { week: string; created: number; completed: number }[];
  inboxThroughput: { week: string; captured: number; processed: number }[];
  inboxFunnel: {
    actionable: number;
    someday: number;
    reference: number;
    trash: number;
    totalProcessed: number;
    pending: number;
  };
}

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
        className="flex items-center gap-1.5 mb-3 group cursor-pointer"
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

export function InsightsGrid({ data }: { data: InsightsData }) {
  return (
    <div className="space-y-8">
      {/* Capture & Process — how well stuff flows into and through the system */}
      <CollapsibleSection title="Capture & Process">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <InboxThroughputWidget data={data.inboxThroughput} />
          <InboxFunnelWidget data={data.inboxFunnel} />
        </div>
      </CollapsibleSection>

      {/* Getting Things Done — task flow and completion patterns */}
      <CollapsibleSection title="Getting Things Done">
        <div className="space-y-4">
          <ThroughputWidget data={data.throughput} />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <ContextEnergyWidget
              contextData={data.contextCompletions}
              energyData={data.energyCompletions}
            />
            <SourceDistributionWidget data={data.sources} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Efficiency — how fast things move through the system */}
      <CollapsibleSection title="Efficiency" defaultOpen={false}>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <CycleTimeWidget data={data.cycleTime} />
          <TimeInStatusWidget data={data.timeInStatus} />
        </div>
      </CollapsibleSection>
    </div>
  );
}
