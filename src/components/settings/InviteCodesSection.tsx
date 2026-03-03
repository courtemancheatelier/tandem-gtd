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
import { useToast } from "@/components/ui/use-toast";
import { Copy, Link, Plus, Ticket } from "lucide-react";

interface InviteCode {
  id: string;
  code: string;
  usedBy: { id: string; name: string; email: string } | null;
  usedAt: string | null;
  expiresAt: string | null;
  tier: string;
  createdAt: string;
}

export function InviteCodesSection() {
  const { toast } = useToast();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [maxCodes, setMaxCodes] = useState(2);

  const fetchCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/invites");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCodes(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
    // Fetch max codes limit
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) => setMaxCodes(data.maxInviteCodesPerUser ?? 2))
      .catch(() => {});
  }, [fetchCodes]);

  async function generateCode() {
    setGenerating(true);
    try {
      const res = await fetch("/api/invites", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate code");
      }
      const newCode = await res.json();
      setCodes((prev) => [newCode, ...prev]);
      toast({ title: "Invite code generated", description: newCode.code });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to generate code",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast({ title: "Code copied" });
  }

  function copyShareLink(code: string) {
    const url = `${window.location.origin}/login?code=${code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Share link copied" });
  }

  function getStatus(code: InviteCode) {
    if (code.usedBy) return "used";
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) return "expired";
    return "available";
  }

  const remaining = maxCodes - codes.length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" />
            Your Invite Codes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="h-5 w-5" />
              Your Invite Codes
            </CardTitle>
            <CardDescription>
              {remaining > 0
                ? `${remaining} of ${maxCodes} codes remaining`
                : `All ${maxCodes} codes used`}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={generateCode}
            disabled={generating || codes.length >= maxCodes}
          >
            <Plus className="h-4 w-4 mr-1" />
            {generating ? "Generating..." : "Generate Code"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invite codes yet. Generate one to invite friends.
          </p>
        ) : (
          <div className="space-y-3">
            {codes.map((code) => {
              const status = getStatus(code);
              return (
                <div
                  key={code.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-sm font-medium">
                      {code.code}
                    </code>
                    {status === "available" && (
                      <Badge
                        variant="outline"
                        className="border-green-400 text-green-600 bg-green-50 text-xs"
                      >
                        Available
                      </Badge>
                    )}
                    {status === "used" && (
                      <Badge
                        variant="outline"
                        className="border-gray-400 text-gray-600 text-xs"
                      >
                        Used by {code.usedBy?.name}
                      </Badge>
                    )}
                    {status === "expired" && (
                      <Badge
                        variant="outline"
                        className="border-red-400 text-red-600 text-xs"
                      >
                        Expired
                      </Badge>
                    )}
                  </div>
                  {status === "available" && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => copyCode(code.code)}
                        title="Copy code"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => copyShareLink(code.code)}
                        title="Copy share link"
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
