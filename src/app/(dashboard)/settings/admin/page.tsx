"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { Shield } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ServerSettingsForm } from "@/components/admin/ServerSettingsForm";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { DomainWhitelistTable } from "@/components/admin/DomainWhitelistTable";
import { GrowthStatsCard } from "@/components/admin/GrowthStatsCard";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { AdminExportSection } from "@/components/settings/admin/AdminExportSection";
import { AdminImportSection } from "@/components/settings/admin/AdminImportSection";
import { RetentionStatusCard } from "@/components/admin/RetentionStatusCard";

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const [defaultDailyLimit, setDefaultDailyLimit] = useState(100);
  const [authMode, setAuthMode] = useState<"OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS">("OAUTH_AND_CREDENTIALS");
  const [userRefreshKey, setUserRefreshKey] = useState(0);

  const fetchDefaultLimit = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setDefaultDailyLimit(data.defaultAiDailyLimit);
        if (data.authMode) setAuthMode(data.authMode);
      }
    } catch {
      // Use the default value of 100
    }
  }, []);

  useEffect(() => {
    if (session?.user?.isAdmin) {
      fetchDefaultLimit();
    }
  }, [session?.user?.isAdmin, fetchDefaultLimit]);

  if (status === "loading") {
    return (
      <div>
        <h1 className="text-2xl font-bold">Admin Settings</h1>
        <p className="text-muted-foreground mt-1">Loading...</p>
      </div>
    );
  }

  if (!session?.user?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground mt-2">
          You do not have permission to access admin settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Admin Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage server configuration and user accounts
        </p>
      </div>

      <Separator />

      <ServerSettingsForm />

      <WaitlistTable onUserPromoted={() => setUserRefreshKey((k) => k + 1)} />

      <DomainWhitelistTable />

      <GrowthStatsCard />

      <UserManagementTable
        key={userRefreshKey}
        currentUserId={session.user.id}
        defaultDailyLimit={defaultDailyLimit}
        authMode={authMode}
      />

      <RetentionStatusCard />

      <Separator />

      <AdminExportSection />

      <AdminImportSection />
    </div>
  );
}
