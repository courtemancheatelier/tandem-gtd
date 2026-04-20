"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BarChart3, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { UsageSummaryCards } from "./UsageSummaryCards";
import { UserUsageTable } from "./UserUsageTable";

interface UsageData {
  summary: {
    totalUsers: number;
    totalTasks: number;
    totalCompleted: number;
    totalProjects: number;
    totalInboxProcessed: number;
    totalReviews: number;
    engagement: {
      active: number;
      new: number;
      drifting: number;
      dormant: number;
    };
  };
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
    lastActive: string | null;
    engagement: "new" | "active" | "drifting" | "dormant";
    tasks: { total: number; active: number; completed: number; dropped: number };
    projects: { total: number; active: number; completed: number; someday: number };
    inbox: {
      captured: number;
      processed: number;
      unprocessed: number;
      processingSessions: number;
      lastProcessed: string | null;
      processingRate: number | null;
    };
    waitingFor: { total: number; unresolved: number };
    reviews: { completed: number; lastReview: string | null };
    setup: { contexts: number; areas: number; goals: number; horizonNotes: number };
  }>;
}

export function UsageDashboard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usage");
      if (!res.ok) throw new Error("Failed to fetch usage data");
      const json = await res.json();
      setData(json);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load usage data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Lazy-load: fetch when first opened
  useEffect(() => {
    if (open && !fetched) {
      setFetched(true);
      fetchData();
    }
  }, [open, fetched, fetchData]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="flex-1 text-left">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5" />
              Usage Dashboard
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${
                  open ? "rotate-0" : "-rotate-90"
                }`}
              />
            </CardTitle>
            <CardDescription>
              Adoption metrics and per-user GTD activity
            </CardDescription>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {loading && !data && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {data && (
              <>
                <UsageSummaryCards data={data.summary} />
                <UserUsageTable users={data.users} />
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
