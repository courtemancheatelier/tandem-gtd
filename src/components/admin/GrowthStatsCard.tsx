"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, TrendingUp, Ticket } from "lucide-react";

interface GrowthStats {
  tierBreakdown: Array<{ tier: string; count: number }>;
  inviteCodes: { total: number; used: number; remaining: number };
  topReferrers: Array<{
    id: string;
    name: string;
    email: string;
    inviteeCount: number;
  }>;
}

const tierColors: Record<string, string> = {
  ALPHA: "border-purple-400 text-purple-600 bg-purple-50",
  BETA: "border-blue-400 text-blue-600 bg-blue-50",
  GENERAL: "border-gray-400 text-gray-600 bg-gray-50",
  WAITLIST: "border-yellow-400 text-yellow-600 bg-yellow-50",
};

export function GrowthStatsCard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Grant codes state
  const [grantTier, setGrantTier] = useState("BETA");
  const [grantCount, setGrantCount] = useState("1");
  const [granting, setGranting] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/growth");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStats(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleGrant() {
    const count = Number(grantCount);
    if (isNaN(count) || count <= 0 || count > 10) return;
    setGranting(true);
    try {
      const res = await fetch("/api/admin/invites/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: grantTier, count }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to grant codes");
      }
      const result = await res.json();
      toast({
        title: "Codes granted",
        description: `${result.codesCreated} codes created for ${result.usersGranted} ${grantTier} users`,
      });
      fetchStats();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to grant codes",
        variant: "destructive",
      });
    } finally {
      setGranting(false);
    }
  }

  const totalUsers = stats?.tierBreakdown.reduce((s, t) => s + t.count, 0) ?? 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Growth Stats
              {totalUsers > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {totalUsers} users
                </Badge>
              )}
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${
                  open ? "rotate-0" : "-rotate-90"
                }`}
              />
            </CardTitle>
            <CardDescription>
              User tier breakdown, invite code usage, and referral tracking
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !stats ? (
              <p className="text-sm text-muted-foreground">Failed to load stats.</p>
            ) : (
              <>
                {/* Tier breakdown */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">User Tiers</h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.tierBreakdown.map((t) => (
                      <Badge
                        key={t.tier}
                        variant="outline"
                        className={`text-sm px-3 py-1 ${tierColors[t.tier] ?? ""}`}
                      >
                        {t.tier}: {t.count}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Invite code stats */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    Invite Codes
                  </h4>
                  <div className="flex gap-4 text-sm">
                    <span>
                      Generated: <strong>{stats.inviteCodes.total}</strong>
                    </span>
                    <span>
                      Used: <strong>{stats.inviteCodes.used}</strong>
                    </span>
                    <span>
                      Available: <strong>{stats.inviteCodes.remaining}</strong>
                    </span>
                  </div>
                </div>

                {/* Top referrers */}
                {stats.topReferrers.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Top Referrers</h4>
                    <div className="space-y-1">
                      {stats.topReferrers.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span>{r.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {r.inviteeCount} invited
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grant codes */}
                <div className="space-y-2 border-t pt-4">
                  <h4 className="text-sm font-medium">Bulk Grant Codes</h4>
                  <p className="text-xs text-muted-foreground">
                    Generate invite codes for all users of a specific tier
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Tier</Label>
                      <Select
                        value={grantTier}
                        onValueChange={setGrantTier}
                        disabled={granting}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALPHA">Alpha</SelectItem>
                          <SelectItem value="BETA">Beta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Codes per user</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        className="w-20"
                        value={grantCount}
                        onChange={(e) => setGrantCount(e.target.value)}
                        disabled={granting}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleGrant}
                      disabled={granting}
                    >
                      {granting ? "Granting..." : "Grant Codes"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
