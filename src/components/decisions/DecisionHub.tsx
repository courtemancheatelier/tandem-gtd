"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Clock, BarChart3, Vote } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProposalDetailView } from "./ProposalDetailView";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "border-gray-400/50 text-gray-500" },
  GATHERING_INPUT: { label: "Gathering Input", color: "border-blue-500/50 text-blue-600" },
  UNDER_REVIEW: { label: "Under Review", color: "border-amber-500/50 text-amber-600" },
  DECIDED: { label: "Decided", color: "border-green-500/50 text-green-600" },
  DEFERRED: { label: "Deferred", color: "border-purple-500/50 text-purple-600" },
  CANCELED: { label: "Canceled", color: "border-muted-foreground/50" },
  OPEN: { label: "Open", color: "border-blue-500/50 text-blue-600" },
  RESOLVED: { label: "Resolved", color: "border-green-500/50 text-green-600" },
  EXPIRED: { label: "Expired", color: "border-amber-500/50 text-amber-600" },
  WITHDRAWN: { label: "Withdrawn", color: "border-muted-foreground/50" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecisionData = any;

interface DecisionHubProps {
  teamId: string;
  currentUserId: string;
}

export function DecisionHub({ teamId, currentUserId }: DecisionHubProps) {
  const [decisions, setDecisions] = useState<DecisionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const fetchDecisions = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}/decisions`);
    if (res.ok) {
      setDecisions(await res.json());
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  const handleRefresh = () => {
    fetchDecisions();
    setSelectedDecisionId(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedDecisionId) {
    return (
      <ProposalDetailView
        decisionId={selectedDecisionId}
        currentUserId={currentUserId}
        onBack={handleRefresh}
      />
    );
  }

  const proposals = decisions.filter((d: DecisionData) => d.decisionType === "PROPOSAL");
  const otherDecisions = decisions.filter((d: DecisionData) => d.decisionType !== "PROPOSAL");
  const activeProposals = proposals.filter((d: DecisionData) => ["DRAFT", "GATHERING_INPUT", "UNDER_REVIEW"].includes(d.status));
  const closedProposals = proposals.filter((d: DecisionData) => ["DECIDED", "DEFERRED", "CANCELED"].includes(d.status));

  return (
    <div className="space-y-4">
      <Tabs defaultValue="proposals">
        <TabsList>
          <TabsTrigger value="proposals">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Proposals ({proposals.length})
          </TabsTrigger>
          <TabsTrigger value="decisions">
            <Vote className="h-3.5 w-3.5 mr-1.5" />
            Decisions ({otherDecisions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proposals" className="space-y-4 mt-4">
          {proposals.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-muted-foreground text-sm">
                  No decision proposals yet. Create one from a project page.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeProposals.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Active ({activeProposals.length})</h3>
                  {activeProposals.map((d: DecisionData) => (
                    <ProposalListItem
                      key={d.id}
                      decision={d}
                      currentUserId={currentUserId}
                      onClick={() => setSelectedDecisionId(d.id)}
                    />
                  ))}
                </div>
              )}
              {closedProposals.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Closed ({closedProposals.length})</h3>
                  {closedProposals.map((d: DecisionData) => (
                    <ProposalListItem
                      key={d.id}
                      decision={d}
                      currentUserId={currentUserId}
                      onClick={() => setSelectedDecisionId(d.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4 mt-4">
          {otherDecisions.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-muted-foreground text-sm">
                  No decisions yet. Create decisions from project pages.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {otherDecisions.map((d: DecisionData) => (
                <div key={d.id} className="rounded-lg border bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedDecisionId(d.id)}>
                  <div className="flex items-center gap-2">
                    {d.decisionType === "POLL" || d.decisionType === "QUICK_POLL" ? (
                      <BarChart3 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Vote className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <span className="text-sm font-medium flex-1 truncate">{d.question}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>By {d.requester?.name}</span>
                    <span>{d.responses?.length ?? 0}/{d.respondents?.length ?? 0} responded</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: "" };
  return (
    <Badge variant="outline" className={cn("text-[10px]", config.color)}>
      {config.label}
    </Badge>
  );
}

function ProposalListItem({ decision, currentUserId, onClick }: { decision: DecisionData; currentUserId: string; onClick: () => void }) {
  const isOwner = decision.requester?.id === currentUserId;
  const inputRequests = decision.inputRequests ?? [];
  const pendingInputs = inputRequests.filter((ir: DecisionData) => ir.status === "PENDING").length;
  const totalInputs = inputRequests.length;

  return (
    <div
      className="rounded-lg border bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium truncate">{decision.question}</h4>
          {decision.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{decision.description}</p>
          )}
        </div>
        <StatusBadge status={decision.status} />
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
        <span>By {decision.requester?.name}</span>
        {totalInputs > 0 && (
          <span>{totalInputs - pendingInputs}/{totalInputs} inputs received</span>
        )}
        {decision.options?.length > 0 && (
          <span>{decision.options.length} options</span>
        )}
        {decision.deadline && (
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {new Date(decision.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
        {isOwner && <Badge variant="outline" className="text-[9px] py-0">Owner</Badge>}
      </div>
    </div>
  );
}
