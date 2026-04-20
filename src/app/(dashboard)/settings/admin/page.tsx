"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { Shield, Settings2, Users, Bot, Mail, Database, BarChart3 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ServerSettingsProvider,
  useServerSettings,
} from "@/lib/hooks/use-server-settings";
import {
  BrandingSettings,
  AuthSettings,
  SupportSettings,
  FeaturesSettings,
  EmailSettings,
  AISettings,
  TeamsSettings,
  RetentionSettings,
} from "@/components/admin/ServerSettingsForm";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { DomainWhitelistTable } from "@/components/admin/DomainWhitelistTable";
import { GrowthStatsCard } from "@/components/admin/GrowthStatsCard";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { AdminExportSection } from "@/components/settings/admin/AdminExportSection";
import { AdminImportSection } from "@/components/settings/admin/AdminImportSection";
import { RetentionStatusCard } from "@/components/admin/RetentionStatusCard";
import { UsageDashboard } from "@/components/admin/UsageDashboard";

function AdminTabs({
  currentUserId,
  defaultDailyLimit,
  authMode,
  userRefreshKey,
  onUserPromoted,
}: {
  currentUserId: string;
  defaultDailyLimit: number;
  authMode: "OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS";
  userRefreshKey: number;
  onUserPromoted: () => void;
}) {
  const { settings, loading } = useServerSettings();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  if (!settings) {
    return (
      <p className="text-sm text-destructive">
        Failed to load server settings.
      </p>
    );
  }

  return (
    <Tabs defaultValue="general">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="general" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          General
        </TabsTrigger>
        <TabsTrigger value="users" className="gap-1.5">
          <Users className="h-4 w-4" />
          Users
        </TabsTrigger>
        <TabsTrigger value="ai" className="gap-1.5">
          <Bot className="h-4 w-4" />
          AI
        </TabsTrigger>
        <TabsTrigger value="email" className="gap-1.5">
          <Mail className="h-4 w-4" />
          Email
        </TabsTrigger>
        <TabsTrigger value="data" className="gap-1.5">
          <Database className="h-4 w-4" />
          Data
        </TabsTrigger>
        <TabsTrigger value="usage" className="gap-1.5">
          <BarChart3 className="h-4 w-4" />
          Usage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4 mt-4">
        <BrandingSettings />
        <AuthSettings />
        <SupportSettings />
        <FeaturesSettings />
      </TabsContent>

      <TabsContent value="users" className="space-y-4 mt-4">
        <UserManagementTable
          key={userRefreshKey}
          currentUserId={currentUserId}
          defaultDailyLimit={defaultDailyLimit}
          authMode={authMode}
        />
        <WaitlistTable onUserPromoted={onUserPromoted} />
        <DomainWhitelistTable />
        <GrowthStatsCard />
      </TabsContent>

      <TabsContent value="ai" className="space-y-4 mt-4">
        <AISettings />
      </TabsContent>

      <TabsContent value="email" className="space-y-4 mt-4">
        <EmailSettings />
      </TabsContent>

      <TabsContent value="data" className="space-y-4 mt-4">
        <TeamsSettings />
        <RetentionSettings />
        <RetentionStatusCard />
        <AdminExportSection />
        <AdminImportSection />
      </TabsContent>

      <TabsContent value="usage" className="space-y-4 mt-4">
        <UsageDashboard />
      </TabsContent>
    </Tabs>
  );
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const [defaultDailyLimit, setDefaultDailyLimit] = useState(100);
  const [authMode, setAuthMode] = useState<
    "OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS"
  >("OAUTH_AND_CREDENTIALS");
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

      <ServerSettingsProvider>
        <AdminTabs
          currentUserId={session.user.id}
          defaultDailyLimit={defaultDailyLimit}
          authMode={authMode}
          userRefreshKey={userRefreshKey}
          onUserPromoted={() => setUserRefreshKey((k) => k + 1)}
        />
      </ServerSettingsProvider>
    </div>
  );
}
