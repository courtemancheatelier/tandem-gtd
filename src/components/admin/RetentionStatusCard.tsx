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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, Loader2, Play, Eye, ChevronDown } from "lucide-react";

interface RetentionStatus {
  settings: {
    retentionEnabled: boolean;
    retentionPeriodDays: number;
    retentionGraceDays: number;
  };
  eligibleCount: number;
  eligible: { id: string; title: string; completedAt: string }[];
  pendingPurgeCount: number;
  pendingPurges: { id: string; title: string }[];
  recentLogs: {
    id: string;
    action: string;
    projectTitle: string | null;
    taskCount: number;
    createdAt: string;
  }[];
}

interface RunResult {
  dryRun: boolean;
  scheduled: { projectId: string; title: string }[];
  purged: { projectId: string; title: string; taskCount: number }[];
  standaloneTasks: number;
  exportsCleaned: number;
  errors: string[];
}

export function RetentionStatusCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<RetentionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/retention");
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleRun(dryRun: boolean) {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (res.ok) {
        const result: RunResult = await res.json();
        const parts: string[] = [];
        if (result.scheduled.length > 0) parts.push(`${result.scheduled.length} scheduled`);
        if (result.purged.length > 0) parts.push(`${result.purged.length} purged`);
        if (result.standaloneTasks > 0) parts.push(`${result.standaloneTasks} standalone tasks`);
        if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);

        toast({
          title: dryRun ? "Dry Run Complete" : "Retention Run Complete",
          description: parts.length > 0 ? parts.join(", ") : "Nothing to process",
        });
        await fetchStatus();
      } else {
        toast({ title: "Error", description: "Retention run failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Retention run failed", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  if (loading) return null;
  if (!status) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-5 w-5" />
              Retention Status
              <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
            </CardTitle>
            <CardDescription>
              Current state of the data retention system
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant={status.settings.retentionEnabled ? "default" : "secondary"}>
                {status.settings.retentionEnabled ? "Enabled" : "Disabled"}
              </Badge>
              {status.settings.retentionEnabled && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {status.eligibleCount} eligible
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {status.pendingPurgeCount} pending purge
                  </span>
                </>
              )}
            </div>

            {status.settings.retentionEnabled && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRun(true)}
                  disabled={running}
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  Dry Run
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRun(false)}
                  disabled={running}
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Run Purge
                </Button>
              </div>
            )}

            {status.pendingPurgeCount > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Pending Purges</p>
                <div className="space-y-1">
                  {status.pendingPurges.map((p) => (
                    <div key={p.id} className="text-sm text-muted-foreground">
                      {p.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status.recentLogs.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Recent Activity</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {status.recentLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {log.action}
                      </Badge>
                      {log.projectTitle && <span className="truncate">{log.projectTitle}</span>}
                      {log.taskCount > 0 && <span>({log.taskCount} tasks)</span>}
                      <span className="ml-auto shrink-0">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
