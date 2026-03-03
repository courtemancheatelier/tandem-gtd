"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings, Link2, AlertTriangle, RefreshCw } from "lucide-react";
import { AISettingsSection } from "@/components/settings/AISettingsSection";
import { ApiTokensSection } from "@/components/settings/ApiTokensSection";
import { InviteCodesSection } from "@/components/settings/InviteCodesSection";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { OnboardingSection } from "@/components/settings/OnboardingSection";
import { NotificationSettingsSection } from "@/components/settings/NotificationSettingsSection";
import { ExportSection } from "@/components/settings/ExportSection";
import { ToolbarCustomizerSection } from "@/components/settings/ToolbarCustomizerSection";

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

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5" />
                Recurring Templates
              </CardTitle>
              <CardDescription>
                Manage recurring task templates and template packs
              </CardDescription>
            </div>
            <Link href="/settings/recurring">
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </Link>
          </div>
        </CardHeader>
      </Card>

      <Separator />

      <LinkedAccountsCard />

      <Separator />

      <AISettingsSection />

      <Separator />

      <ApiTokensSection />

      <Separator />

      <InviteCodesSection />

      <Separator />

      <NotificationSettingsSection />

      <Separator />

      <ToolbarCustomizerSection />

      <Separator />

      <OnboardingSection />

      <Separator />

      <ExportSection />

      <Separator />

      <DeleteAccountSection />
    </div>
  );
}
