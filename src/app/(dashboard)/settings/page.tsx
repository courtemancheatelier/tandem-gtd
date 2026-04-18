"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Link2,
  AlertTriangle,
  RefreshCw,
  Settings2,
  Bell,
  Bot,
  Database,
  Tag,
  Layers,
  Globe,
  Eye,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { AISettingsSection } from "@/components/settings/AISettingsSection";
import { ApiTokensSection } from "@/components/settings/ApiTokensSection";
import { InviteCodesSection } from "@/components/settings/InviteCodesSection";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { OnboardingSection } from "@/components/settings/OnboardingSection";
import { NotificationSettingsSection } from "@/components/settings/NotificationSettingsSection";
import { CalendarSettingsSection } from "@/components/settings/CalendarSettingsSection";
import { MicrosoftCalendarSection } from "@/components/settings/MicrosoftCalendarSection";
import { ExportSection } from "@/components/settings/ExportSection";
import { ToolbarCustomizerSection } from "@/components/settings/ToolbarCustomizerSection";
import { EmailCaptureSection } from "@/components/settings/EmailCaptureSection";
import { FeatureVisibilitySection } from "@/components/settings/FeatureVisibilitySection";

interface LinkedAccount {
  id: string;
  provider: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  "azure-ad": "Microsoft",
};

function LinkedAccountsCard() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);

  useEffect(() => {
    fetch("/api/settings/linked-accounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(data))
      .catch(() => {});
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="h-5 w-5" />
              Linked Accounts
            </CardTitle>
            <CardDescription>
              OAuth providers connected to your account
            </CardDescription>
          </div>
          <Link href="/settings/linked-accounts">
            <Button variant="outline" size="sm">
              Manage
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {accounts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((account) => (
              <Badge key={account.id} variant="secondary" className="text-xs">
                {PROVIDER_LABELS[account.provider] || account.provider}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No OAuth providers linked.</p>
        )}
        {accounts.length === 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Link an OAuth provider to enable passwordless sign-in and prepare for OAuth-only mode.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Paris",
      "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "UTC",
    ];
  }
})();

function TimezoneCard() {
  const { toast } = useToast();
  const [timezone, setTimezone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (data?.timezone) {
          setTimezone(data.timezone);
          // Auto-detect on first visit
          if (data.timezone === "America/New_York") {
            const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (detected && detected !== data.timezone) {
              const res = await fetch("/api/notification-preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ timezone: detected }),
              });
              if (res.ok) setTimezone(detected);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  async function update(tz: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      });
      if (res.ok) {
        setTimezone(tz);
        toast({ title: "Timezone updated" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (!timezone) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="h-5 w-5" />
          Timezone
        </CardTitle>
        <CardDescription>
          Used for card file day boundaries, notification timing, and quiet hours
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="tz-select">Your timezone</Label>
          <Select value={timezone} onValueChange={update} disabled={saving}>
            <SelectTrigger id="tz-select" className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Your recurring tasks and routine cards reset at midnight in this timezone.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure your Tandem experience
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="general" className="gap-1.5">
            <Settings2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="ai-api" className="gap-1.5">
            <Bot className="h-4 w-4" />
            AI & API
          </TabsTrigger>
          <TabsTrigger value="card-files" className="gap-1.5">
            <Layers className="h-4 w-4" />
            Card Files
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-1.5">
            <Eye className="h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5">
            <Database className="h-4 w-4" />
            Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <TimezoneCard />
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="h-5 w-5" />
                    Contexts
                  </CardTitle>
                  <CardDescription>
                    Manage GTD contexts (@home, @office, @errands, etc.)
                  </CardDescription>
                </div>
                <Link href="/contexts">
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
          </Card>
          <LinkedAccountsCard />
          <EmailCaptureSection />
          <OnboardingSection />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-4">
          <NotificationSettingsSection />
          <ToolbarCustomizerSection />
        </TabsContent>

        <TabsContent value="ai-api" className="space-y-4 mt-4">
          <AISettingsSection />
          <ApiTokensSection />
          <InviteCodesSection />
        </TabsContent>

        <TabsContent value="card-files" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <RefreshCw className="h-5 w-5" />
                    Routines & Recurring Cards
                  </CardTitle>
                  <CardDescription>
                    Manage recurring tasks, routines, and template packs
                  </CardDescription>
                </div>
                <Link href="/settings/routines">
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-4 mt-4">
          <FeatureVisibilitySection />
        </TabsContent>

        <TabsContent value="data" className="space-y-4 mt-4">
          <CalendarSettingsSection />
          <MicrosoftCalendarSection />
          <ExportSection />
          <DeleteAccountSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
