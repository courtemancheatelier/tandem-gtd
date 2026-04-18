"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useToast } from "@/components/ui/use-toast";

export interface ServerSettings {
  serverAiEnabled: boolean;
  serverAnthropicApiKey: string | null;
  hasServerKey: boolean;
  allowUserOwnKeys: boolean;
  shareServerKey: boolean;
  defaultAiDailyLimit: number;
  defaultAiModel: string;
  mcpEnabled: boolean;
  serverInAppAiEnabled: boolean;
  allowUserAiToggle: boolean;
  allowUserInAppAiToggle: boolean;
  allowUserMcpToggle: boolean;
  teamsEnabled: boolean;
  teamsAdminOnly: boolean;
  apiAccessEnabled: boolean;
  landingEnabled: boolean;
  registrationMode: "CLOSED" | "WAITLIST" | "INVITE_ONLY" | "OPEN" | "TRIAL";
  authMode: "OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS";
  maxInviteCodesPerUser: number;
  trialDurationDays: number;
  // Branding
  landingMode: "FLAGSHIP" | "OPERATOR";
  instanceName: string;
  instanceTagline: string;
  instanceDesc: string | null;
  instanceLogoUrl: string | null;
  accentColor: string;
  operatorName: string | null;
  operatorUrl: string | null;
  heroHeading: string | null;
  heroDescription: string | null;
  featureHighlights: string | null;
  ctaHeading: string | null;
  ctaDescription: string | null;
  ctaButtonText: string | null;
  ctaButtonUrl: string | null;
  supportUrl: string | null;
  // SMTP
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
  hasSmtpConfig: boolean;
  smtpFromEnv: boolean;
  // Email templates
  emailWaitlistSubject: string | null;
  emailWaitlistBody: string | null;
  emailWelcomeSubject: string | null;
  emailWelcomeBody: string | null;
  // Data retention
  retentionEnabled: boolean;
  retentionPeriodDays: number;
  retentionGraceDays: number;
  retentionExportPath: string | null;
  retentionExportKeepDays: number;
  retentionStandaloneTasks: boolean;
  retentionBatchSize: number;
  // Feature visibility
  disabledFeatures: string | null;
}

interface ServerSettingsContextValue {
  settings: ServerSettings | null;
  loading: boolean;
  saving: boolean;
  setSettings: (settings: ServerSettings) => void;
  updateSettings: (updates: Partial<ServerSettings>) => Promise<void>;
  fetchSettings: () => Promise<void>;
}

const ServerSettingsContext = createContext<ServerSettingsContextValue | null>(null);

export function ServerSettingsProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      setSettings(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load server settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(
    async (updates: Partial<ServerSettings>) => {
      setSaving(true);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error || "Failed to update settings");
        }
        const data = await res.json();
        setSettings(data);
        toast({ title: "Settings updated" });
      } catch (err) {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to update settings",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  return (
    <ServerSettingsContext.Provider
      value={{ settings, loading, saving, setSettings, updateSettings, fetchSettings }}
    >
      {children}
    </ServerSettingsContext.Provider>
  );
}

export function useServerSettings() {
  const ctx = useContext(ServerSettingsContext);
  if (!ctx) {
    throw new Error("useServerSettings must be used within a ServerSettingsProvider");
  }
  return ctx;
}
