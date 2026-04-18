"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/use-toast";
import { CalendarDays, ChevronDown, RefreshCw, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface GoogleCalendarStatus {
  connected: boolean;
  hasRefreshToken: boolean;
  syncEnabled: boolean;
  tandemCalendarId: string | null;
  lastSyncedAt: string | null;
  consecutiveErrors: number;
  lastError: string | null;
  lastErrorAt: string | null;
}

interface GoogleCalendarItem {
  id: string;
  summary: string;
  color: string;
  primary: boolean;
  enabled: boolean;
}

export function CalendarSettingsSection() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<GoogleCalendarStatus | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [googleCalendars, setGoogleCalendars] = React.useState<GoogleCalendarItem[]>([]);
  const [calendarsLoading, setCalendarsLoading] = React.useState(false);
  const [lastReadSyncAt, setLastReadSyncAt] = React.useState<string | null>(null);
  const [readSyncLoading, setReadSyncLoading] = React.useState(false);

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/google/status");
      if (res.ok) setStatus(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleConnect() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/calendar/google/connect", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Connected", description: "Google Calendar sync is now active." });
        await fetchStatus();
      } else {
        toast({
          title: "Connection failed",
          description: data.error || "Could not connect Google Calendar.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to connect Google Calendar.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/calendar/google/disconnect?deleteTandemCalendar=true", {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "Disconnected", description: "Google Calendar sync has been disabled." });
        await fetchStatus();
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to disconnect Google Calendar.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRetry() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/calendar/google/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sync retry complete",
          description: `Retried ${data.retriedCount} event(s).`,
        });
        await fetchStatus();
      }
    } catch {
      toast({
        title: "Error",
        description: "Sync retry failed.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleSync(enabled: boolean) {
    // Toggle sync by reconnecting or updating via connect endpoint
    if (enabled) {
      await handleConnect();
    } else {
      // Just disable sync without disconnecting
      setActionLoading(true);
      try {
        await fetch("/api/calendar/google/disconnect", { method: "POST" });
        await fetchStatus();
      } catch {} finally {
        setActionLoading(false);
      }
    }
  }

  const fetchGoogleCalendars = React.useCallback(async () => {
    setCalendarsLoading(true);
    try {
      const res = await fetch("/api/calendar/google/calendars");
      if (res.ok) {
        const data = await res.json();
        setGoogleCalendars(data.calendars || []);
        setLastReadSyncAt(data.lastReadSyncAt || null);
      }
    } catch {}
    setCalendarsLoading(false);
  }, []);

  // Fetch calendars when connected and section is open
  React.useEffect(() => {
    if (open && status?.connected) {
      fetchGoogleCalendars();
    }
  }, [open, status?.connected, fetchGoogleCalendars]);

  async function handleToggleCalendar(calId: string, enabled: boolean) {
    const updated = googleCalendars.map((c) =>
      c.id === calId ? { ...c, enabled } : c
    );
    setGoogleCalendars(updated);

    try {
      await fetch("/api/calendar/google/calendars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendars: updated.map((c) => ({
            id: c.id,
            summary: c.summary,
            color: c.color,
            enabled: c.enabled,
          })),
        }),
      });
      if (enabled) {
        toast({ title: "Calendar enabled", description: `"${updated.find((c) => c.id === calId)?.summary}" will be imported.` });
      }
    } catch {
      // Revert on error
      setGoogleCalendars(googleCalendars);
      toast({ title: "Error", description: "Failed to update calendar selection.", variant: "destructive" });
    }
  }

  async function handleReadSync() {
    setReadSyncLoading(true);
    try {
      const res = await fetch("/api/calendar/google/read-sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.debounced) {
          toast({ title: "Sync skipped", description: "Last sync was less than 5 minutes ago." });
        } else {
          toast({
            title: "Sync complete",
            description: `Imported ${data.upserted} event(s), removed ${data.deleted}.`,
          });
        }
        setLastReadSyncAt(new Date().toISOString());
      }
    } catch {
      toast({ title: "Error", description: "Read sync failed.", variant: "destructive" });
    }
    setReadSyncLoading(false);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading calendar settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              Google Calendar
              <div className="ml-auto flex items-center gap-2">
                {status?.connected ? (
                  <Badge variant="default" className="bg-green-600 text-xs">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Not connected
                  </Badge>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    open ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </div>
            </CardTitle>
            <CardDescription>
              Sync Tandem calendar events to your Google Calendar for phone notifications.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {!status?.connected ? (
              /* Not connected state */
              <div className="space-y-3">
                {!status?.hasRefreshToken && (
                  <p className="text-sm text-muted-foreground">
                    Make sure you have a Google account linked in{" "}
                    <span className="font-medium">Linked Accounts</span> above.
                    You may need to re-authenticate to grant calendar access.
                  </p>
                )}
                <Button
                  onClick={handleConnect}
                  disabled={actionLoading || !status?.hasRefreshToken}
                >
                  {actionLoading ? "Connecting..." : "Connect Google Calendar"}
                </Button>
              </div>
            ) : (
              /* Connected state */
              <div className="space-y-4">
                {/* Sync toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Sync Enabled</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Push new and updated events to Google Calendar.
                    </p>
                  </div>
                  <Switch
                    checked={status.syncEnabled}
                    onCheckedChange={handleToggleSync}
                    disabled={actionLoading}
                  />
                </div>

                {/* Last synced */}
                {status.lastSyncedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced:{" "}
                    {new Date(status.lastSyncedAt).toLocaleString()}
                  </p>
                )}

                {/* Error state */}
                {status.consecutiveErrors > 0 && status.lastError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                    <p className="text-xs text-red-800 dark:text-red-200">
                      Sync error ({status.consecutiveErrors} consecutive):{" "}
                      {status.lastError}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleRetry}
                      disabled={actionLoading}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Retry Sync
                    </Button>
                  </div>
                )}

                {/* Import External Calendars */}
                <div className="pt-2 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Import External Calendars</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pull events from your Google Calendars into Tandem (read-only).
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReadSync}
                      disabled={readSyncLoading || !googleCalendars.some((c) => c.enabled)}
                    >
                      <Download className={`h-3.5 w-3.5 mr-1 ${readSyncLoading ? "animate-spin" : ""}`} />
                      Sync Now
                    </Button>
                  </div>

                  {lastReadSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Last imported: {new Date(lastReadSyncAt).toLocaleString()}
                    </p>
                  )}

                  {calendarsLoading ? (
                    <p className="text-xs text-muted-foreground">Loading calendars...</p>
                  ) : googleCalendars.length > 0 ? (
                    <div className="space-y-2">
                      {googleCalendars.map((cal) => (
                        <label
                          key={cal.id}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <Checkbox
                            checked={cal.enabled}
                            onCheckedChange={(checked) =>
                              handleToggleCalendar(cal.id, !!checked)
                            }
                          />
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: cal.color }}
                          />
                          <span className="text-sm group-hover:text-foreground transition-colors">
                            {cal.summary}
                            {cal.primary && (
                              <span className="text-xs text-muted-foreground ml-1">(primary)</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No calendars found. Make sure your Google account has calendar access.
                    </p>
                  )}
                </div>

                {/* Disconnect */}
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                    className="text-destructive hover:text-destructive"
                  >
                    {actionLoading ? "Disconnecting..." : "Disconnect Google Calendar"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    This will remove the Tandem calendar from Google and stop syncing.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
