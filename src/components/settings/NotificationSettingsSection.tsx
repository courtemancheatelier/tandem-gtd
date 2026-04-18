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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/use-toast";
import { Separator } from "@/components/ui/separator";
import { Bell, ChevronDown, Mail } from "lucide-react";
import { usePushSubscription } from "@/components/notifications/usePushSubscription";

interface NotificationPreference {
  pushEnabled: boolean;
  pushDueToday: boolean;
  pushDueTomorrow: boolean;
  pushOverdue: boolean;
  pushWeeklyReview: boolean;
  pushDecisions: boolean;
  pushDailyDigest: boolean;
  reminderTimeHour: number;
  reminderTimeMinute: number;
  weeklyReviewDay: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  timezone: string;
  emailEnabled: boolean;
  emailDailyDigest: boolean;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${i.toString().padStart(2, "0")}:00`,
}));

export function NotificationSettingsSection() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [prefs, setPrefs] = React.useState<NotificationPreference | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { permission, subscribed, subscribe, unsubscribe, loading: pushLoading } =
    usePushSubscription();

  React.useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (data) {
          setPrefs(data);
          // Auto-detect browser timezone if the preference still has the default
          if (data.timezone === "America/New_York") {
            const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (detected && detected !== data.timezone) {
              try {
                const res = await fetch("/api/notification-preferences", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ timezone: detected }),
                });
                if (res.ok) {
                  setPrefs((prev) => prev ? { ...prev, timezone: detected } : prev);
                }
              } catch {
                // Ignore — not critical
              }
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updatePref = async (updates: Partial<NotificationPreference>) => {
    if (!prefs) return;
    const newPrefs = { ...prefs, ...updates };
    setPrefs(newPrefs);
    setSaving(true);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      toast({
        title: "Error",
        description: "Failed to save notification preferences.",
        variant: "destructive",
      });
      // Revert
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await subscribe();
      if (!success) {
        if (permission === "denied") {
          toast({
            title: "Notifications blocked",
            description:
              "Please enable notifications in your browser settings, then try again.",
            variant: "destructive",
          });
        }
        return;
      }
    } else {
      await unsubscribe();
    }
    updatePref({ pushEnabled: enabled });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading notification settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!prefs) return null;

  const pushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5" />
              Notifications
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${
                  open ? "rotate-0" : "-rotate-90"
                }`}
              />
            </CardTitle>
            <CardDescription>
              Configure push notifications and reminder preferences.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Push toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Push Notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {!pushSupported
                    ? "Push notifications are not supported in this browser."
                    : permission === "denied"
                      ? "Notifications are blocked. Enable them in your browser settings."
                      : subscribed
                        ? "This device is subscribed to push notifications."
                        : "Enable to receive push notifications on this device."}
                </p>
              </div>
              <Switch
                checked={prefs.pushEnabled && subscribed}
                onCheckedChange={handlePushToggle}
                disabled={!pushSupported || pushLoading || saving}
              />
            </div>

            {/* Notification type toggles */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">What to notify about</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-due-today"
                    checked={prefs.pushDueToday}
                    onCheckedChange={(v) =>
                      updatePref({ pushDueToday: v === true })
                    }
                    disabled={saving}
                  />
                  <Label htmlFor="push-due-today" className="text-sm font-normal">
                    Task due today
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-due-tomorrow"
                    checked={prefs.pushDueTomorrow}
                    onCheckedChange={(v) =>
                      updatePref({ pushDueTomorrow: v === true })
                    }
                    disabled={saving}
                  />
                  <Label
                    htmlFor="push-due-tomorrow"
                    className="text-sm font-normal"
                  >
                    Task due tomorrow
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-overdue"
                    checked={prefs.pushOverdue}
                    onCheckedChange={(v) =>
                      updatePref({ pushOverdue: v === true })
                    }
                    disabled={saving}
                  />
                  <Label htmlFor="push-overdue" className="text-sm font-normal">
                    Task overdue
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-weekly-review"
                    checked={prefs.pushWeeklyReview}
                    onCheckedChange={(v) =>
                      updatePref({ pushWeeklyReview: v === true })
                    }
                    disabled={saving}
                  />
                  <Label
                    htmlFor="push-weekly-review"
                    className="text-sm font-normal"
                  >
                    Weekly review reminder
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-decisions"
                    checked={prefs.pushDecisions}
                    onCheckedChange={(v) =>
                      updatePref({ pushDecisions: v === true })
                    }
                    disabled={saving}
                  />
                  <Label
                    htmlFor="push-decisions"
                    className="text-sm font-normal"
                  >
                    Decision requests & resolutions
                  </Label>
                </div>
              </div>
            </div>

            <Separator />

            {/* Daily Digest */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Daily Digest</Label>
              <p className="text-xs text-muted-foreground">
                Receive a single daily summary instead of individual task notifications.
                Sent at your reminder time.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-daily-digest"
                    checked={prefs.pushDailyDigest}
                    onCheckedChange={(v) =>
                      updatePref({ pushDailyDigest: v === true })
                    }
                    disabled={saving}
                  />
                  <Label htmlFor="push-daily-digest" className="text-sm font-normal">
                    Push notification — daily summary
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="email-daily-digest"
                    checked={prefs.emailDailyDigest}
                    onCheckedChange={(v) =>
                      updatePref({ emailDailyDigest: v === true })
                    }
                    disabled={saving || !prefs.emailEnabled}
                  />
                  <Label htmlFor="email-daily-digest" className="text-sm font-normal">
                    Email — daily digest
                  </Label>
                </div>
              </div>
            </div>

            <Separator />

            {/* Email Notifications */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Notifications
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive notification emails (requires SMTP configured by admin).
                </p>
              </div>
              <Switch
                checked={prefs.emailEnabled}
                onCheckedChange={(checked) =>
                  updatePref({ emailEnabled: checked })
                }
                disabled={saving}
              />
            </div>

            <Separator />

            {/* Timezone reference */}
            <div className="space-y-1">
              <Label>Timezone</Label>
              <p className="text-sm">{prefs.timezone.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">
                All times below use this timezone. Change it in{" "}
                <a href="/settings" className="text-primary hover:underline">General settings</a>.
              </p>
            </div>

            {/* Timing selects */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reminder-time">Reminder time</Label>
                <Select
                  value={String(prefs.reminderTimeHour)}
                  onValueChange={(v) =>
                    updatePref({ reminderTimeHour: parseInt(v, 10) })
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="reminder-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h.value} value={h.value}>
                        {h.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-day">Weekly review day</Label>
                <Select
                  value={String(prefs.weeklyReviewDay)}
                  onValueChange={(v) =>
                    updatePref({ weeklyReviewDay: parseInt(v, 10) })
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="review-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quiet hours */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Quiet hours</Label>
                <Switch
                  checked={prefs.quietHoursStart != null}
                  onCheckedChange={(enabled) => {
                    if (enabled) {
                      updatePref({ quietHoursStart: 22, quietHoursEnd: 7 });
                    } else {
                      updatePref({ quietHoursStart: null, quietHoursEnd: null });
                    }
                  }}
                  disabled={saving}
                />
              </div>
              {prefs.quietHoursStart != null && prefs.quietHoursEnd != null && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="quiet-start" className="text-xs text-muted-foreground">
                      From
                    </Label>
                    <Select
                      value={String(prefs.quietHoursStart)}
                      onValueChange={(v) =>
                        updatePref({ quietHoursStart: parseInt(v, 10) })
                      }
                      disabled={saving}
                    >
                      <SelectTrigger id="quiet-start">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (
                          <SelectItem key={h.value} value={h.value}>
                            {h.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quiet-end" className="text-xs text-muted-foreground">
                      To
                    </Label>
                    <Select
                      value={String(prefs.quietHoursEnd)}
                      onValueChange={(v) =>
                        updatePref({ quietHoursEnd: parseInt(v, 10) })
                      }
                      disabled={saving}
                    >
                      <SelectTrigger id="quiet-end">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (
                          <SelectItem key={h.value} value={h.value}>
                            {h.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
