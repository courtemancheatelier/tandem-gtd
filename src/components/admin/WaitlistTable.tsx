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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, Shield, X } from "lucide-react";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  provider: string;
  providerAccountId: string;
  status: "PENDING" | "DECLINED";
  createdAt: string;
  updatedAt: string;
}

interface WaitlistTableProps {
  onUserPromoted?: () => void;
}

export function WaitlistTable({ onUserPromoted }: WaitlistTableProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [registrationMode, setRegistrationMode] = useState<"CLOSED" | "WAITLIST" | "INVITE_ONLY" | "OPEN" | "TRIAL" | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [maxInviteCodes, setMaxInviteCodes] = useState(2);
  const [maxInviteCodesInput, setMaxInviteCodesInput] = useState("2");
  const [savingInviteLimit, setSavingInviteLimit] = useState(false);
  const [trialDurationDays, setTrialDurationDays] = useState(30);
  const [trialDurationInput, setTrialDurationInput] = useState("30");
  const [savingTrialDuration, setSavingTrialDuration] = useState(false);
  const [landingMode, setLandingMode] = useState<"FLAGSHIP" | "OPERATOR">("OPERATOR");

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/waitlist");
      if (!res.ok) throw new Error("Failed to fetch waitlist");
      const data = await res.json();
      setEntries(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load waitlist entries",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEntries();
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) => {
        setRegistrationMode(data.registrationMode ?? "WAITLIST");
        setMaxInviteCodes(data.maxInviteCodesPerUser ?? 2);
        setMaxInviteCodesInput(String(data.maxInviteCodesPerUser ?? 2));
        setTrialDurationDays(data.trialDurationDays ?? 30);
        setTrialDurationInput(String(data.trialDurationDays ?? 30));
        setLandingMode(data.landingMode ?? "OPERATOR");
      })
      .catch(() => {});
  }, [fetchEntries]);

  async function updateMaxInviteCodes() {
    const limit = Number(maxInviteCodesInput);
    if (isNaN(limit) || limit <= 0) return;
    setSavingInviteLimit(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxInviteCodesPerUser: limit }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setMaxInviteCodes(limit);
      toast({ title: "Invite code limit updated" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update invite code limit",
        variant: "destructive",
      });
    } finally {
      setSavingInviteLimit(false);
    }
  }

  async function updateTrialDuration() {
    const days = Number(trialDurationInput);
    if (isNaN(days) || days < 1 || days > 365) return;
    setSavingTrialDuration(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialDurationDays: days }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setTrialDurationDays(days);
      toast({ title: "Trial duration updated" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update trial duration",
        variant: "destructive",
      });
    } finally {
      setSavingTrialDuration(false);
    }
  }

  async function updateRegistrationMode(mode: "CLOSED" | "WAITLIST" | "INVITE_ONLY" | "OPEN" | "TRIAL") {
    setSavingMode(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationMode: mode }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setRegistrationMode(mode);
      toast({ title: "Registration mode updated" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update registration mode",
        variant: "destructive",
      });
    } finally {
      setSavingMode(false);
    }
  }

  const pendingEntries = entries.filter((e) => e.status === "PENDING");
  const declinedEntries = entries.filter((e) => e.status === "DECLINED");

  async function handlePromote(entryId: string) {
    setActionLoading(entryId);
    try {
      const res = await fetch("/api/admin/waitlist/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitlistEntryId: entryId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }
      toast({ title: "User approved and account created" });
      await fetchEntries();
      onUserPromoted?.();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to approve user",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDecline(entryId: string) {
    setActionLoading(entryId);
    try {
      const res = await fetch("/api/admin/waitlist/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitlistEntryId: entryId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to decline");
      }
      toast({ title: "User declined" });
      await fetchEntries();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to decline user",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function providerLabel(provider: string) {
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Registration & Waitlist
              {!loading && pendingEntries.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pendingEntries.length} pending
                </Badge>
              )}
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${
                  open ? "rotate-0" : "-rotate-90"
                }`}
              />
            </CardTitle>
            <CardDescription>
              Control how new users can sign up and manage beta access requests
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Registration mode selector */}
            {registrationMode && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={savingMode}
                    onClick={() => updateRegistrationMode("CLOSED")}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/50",
                      registrationMode === "CLOSED"
                        ? "border-primary bg-primary/5"
                        : "border-muted"
                    )}
                  >
                    <p className="font-medium text-sm">Closed</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No new registrations — only existing users can sign in
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={savingMode}
                    onClick={() => updateRegistrationMode("WAITLIST")}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/50",
                      registrationMode === "WAITLIST"
                        ? "border-primary bg-primary/5"
                        : "border-muted"
                    )}
                  >
                    <p className="font-medium text-sm">Waitlist</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      New signups join a waitlist for admin approval
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={savingMode}
                    onClick={() => updateRegistrationMode("INVITE_ONLY")}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/50",
                      registrationMode === "INVITE_ONLY"
                        ? "border-primary bg-primary/5"
                        : "border-muted"
                    )}
                  >
                    <p className="font-medium text-sm">Invite only</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      New signups require a valid invite code from an existing user
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={savingMode}
                    onClick={() => updateRegistrationMode("OPEN")}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/50",
                      registrationMode === "OPEN"
                        ? "border-primary bg-primary/5"
                        : "border-muted"
                    )}
                  >
                    <p className="font-medium text-sm">Open</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Anyone can sign up immediately
                    </p>
                  </button>
                  {landingMode === "FLAGSHIP" && (
                    <button
                      type="button"
                      disabled={savingMode}
                      onClick={() => updateRegistrationMode("TRIAL")}
                      className={cn(
                        "rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/50",
                        registrationMode === "TRIAL"
                          ? "border-primary bg-primary/5"
                          : "border-muted"
                      )}
                    >
                      <p className="font-medium text-sm">Trial</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        New users get a time-limited free trial
                      </p>
                    </button>
                  )}
                </div>

                {/* Trial duration — shown when mode is TRIAL */}
                {registrationMode === "TRIAL" && (
                  <div className="flex items-end gap-2 mt-2">
                    <div className="space-y-1">
                      <Label htmlFor="trial-duration" className="text-sm">Trial duration (days)</Label>
                      <Input
                        id="trial-duration"
                        type="number"
                        min="1"
                        max="365"
                        className="w-24"
                        value={trialDurationInput}
                        onChange={(e) => setTrialDurationInput(e.target.value)}
                        disabled={savingTrialDuration}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={updateTrialDuration}
                      disabled={savingTrialDuration || trialDurationInput === String(trialDurationDays)}
                    >
                      {savingTrialDuration ? "Saving..." : "Update"}
                    </Button>
                  </div>
                )}

                {/* Max invite codes per user — shown when mode is INVITE_ONLY */}
                {registrationMode === "INVITE_ONLY" && (
                  <div className="flex items-end gap-2 mt-2">
                    <div className="space-y-1">
                      <Label htmlFor="max-invite-codes" className="text-sm">Max invite codes per user</Label>
                      <Input
                        id="max-invite-codes"
                        type="number"
                        min="1"
                        className="w-24"
                        value={maxInviteCodesInput}
                        onChange={(e) => setMaxInviteCodesInput(e.target.value)}
                        disabled={savingInviteLimit}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={updateMaxInviteCodes}
                      disabled={savingInviteLimit || maxInviteCodesInput === String(maxInviteCodes)}
                    >
                      {savingInviteLimit ? "Saving..." : "Update"}
                    </Button>
                  </div>
                )}
              </>
            )}

            <Separator />

            {/* Waitlist entries */}
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : pendingEntries.length === 0 && declinedEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No waitlist entries yet.
              </p>
            ) : (
              <>
                {pendingEntries.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 font-medium">Name</th>
                          <th className="pb-2 font-medium">Email</th>
                          <th className="pb-2 font-medium">Provider</th>
                          <th className="pb-2 font-medium">Signed Up</th>
                          <th className="pb-2 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingEntries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0">
                            <td className="py-2">{entry.name}</td>
                            <td className="py-2 text-muted-foreground">
                              {entry.email}
                            </td>
                            <td className="py-2">{providerLabel(entry.provider)}</td>
                            <td className="py-2 text-muted-foreground">
                              {formatDate(entry.createdAt)}
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  disabled={actionLoading === entry.id}
                                  onClick={() => handlePromote(entry.id)}
                                  title="Approve"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  disabled={actionLoading === entry.id}
                                  onClick={() => handleDecline(entry.id)}
                                  title="Decline"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {pendingEntries.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No pending entries.
                  </p>
                )}

                {declinedEntries.length > 0 && (
                  <Collapsible open={resolvedOpen} onOpenChange={setResolvedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${
                          resolvedOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                      {declinedEntries.length} declined
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="overflow-x-auto mt-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 font-medium">Name</th>
                              <th className="pb-2 font-medium">Email</th>
                              <th className="pb-2 font-medium">Provider</th>
                            </tr>
                          </thead>
                          <tbody>
                            {declinedEntries.map((entry) => (
                              <tr
                                key={entry.id}
                                className="border-b last:border-0"
                              >
                                <td className="py-2">{entry.name}</td>
                                <td className="py-2 text-muted-foreground">
                                  {entry.email}
                                </td>
                                <td className="py-2">
                                  {providerLabel(entry.provider)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
