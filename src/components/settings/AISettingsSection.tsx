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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
import { Bot, ChevronDown, Shield, Server, Sparkles } from "lucide-react";
import { ApiKeyInput } from "./ApiKeyInput";

type AIVisibility = "VISIBLE" | "HIDDEN" | "READ_ONLY";

interface AISettings {
  aiEnabled: boolean;
  inAppAiEnabled: boolean;
  inAppAiChatEnabled: boolean;
  inAppAiFeaturesEnabled: boolean;
  mcpEnabled: boolean;
  aiDailyLimit: number | null;
  aiMessagesUsedToday: number;
  aiLimitResetAt: string | null;
  aiCanReadTasks: boolean;
  aiCanReadProjects: boolean;
  aiCanReadInbox: boolean;
  aiCanReadNotes: boolean;
  aiCanModify: boolean;
  aiDefaultVisibility: AIVisibility;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  hasServerKey: boolean;
  serverAiEnabled: boolean;
  serverInAppAiEnabled: boolean;
  serverMcpEnabled: boolean;
  allowUserAiToggle: boolean;
  allowUserInAppAiToggle: boolean;
  allowUserMcpToggle: boolean;
  effectiveDailyLimit: number;
}

export function AISettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<AISettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [integrationOpen, setIntegrationOpen] = React.useState(false);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);

  const fetchSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/settings/ai");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load AI settings");
      }
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load settings";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }
      const data = await res.json();
      setSettings((prev) => (prev ? { ...prev, ...data } : null));
      toast({
        title: "Settings updated",
        description: "Your AI settings have been saved.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update settings";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleToggle = (field: string) => (checked: boolean) => {
    updateSettings({ [field]: checked });
  };

  const handleSaveKey = async (key: string) => {
    await updateSettings({ apiKey: key });
  };

  const handleClearKey = async () => {
    await updateSettings({ apiKey: null });
  };

  const handleVisibilityChange = (value: string) => {
    updateSettings({ aiDefaultVisibility: value });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              AI Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading AI settings...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              AI Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-destructive">
              {error || "Failed to load AI settings"}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!settings.serverAiEnabled) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              AI Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              AI features are disabled by your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Integration Card */}
      <Collapsible open={integrationOpen} onOpenChange={setIntegrationOpen}>
        <Card>
          <CollapsibleTrigger className="w-full text-left">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5" />
                AI Integration
                <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${integrationOpen ? "rotate-0" : "-rotate-90"}`} />
              </CardTitle>
              <CardDescription>
                Configure AI features and manage your API key.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          {/* Enable/Disable AI */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ai-enabled">Enable AI features</Label>
              <p className="text-xs text-muted-foreground">
                When disabled, no AI features will work and no data is shared
                with any AI service.
              </p>
              {!settings.allowUserAiToggle && (
                <p className="text-xs text-muted-foreground italic">
                  Managed by your administrator
                </p>
              )}
            </div>
            <Switch
              id="ai-enabled"
              checked={settings.aiEnabled}
              onCheckedChange={handleToggle("aiEnabled")}
              disabled={!settings.allowUserAiToggle}
            />
          </div>

          <Separator />

          {/* Enable/Disable MCP */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="mcp-enabled" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Enable MCP Access
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow external AI tools to connect to your account via MCP.
              </p>
              {!settings.serverMcpEnabled && (
                <p className="text-xs text-muted-foreground italic">
                  MCP is disabled server-wide
                </p>
              )}
              {settings.serverMcpEnabled && !settings.allowUserMcpToggle && (
                <p className="text-xs text-muted-foreground italic">
                  Managed by your administrator
                </p>
              )}
            </div>
            <Switch
              id="mcp-enabled"
              checked={settings.mcpEnabled}
              onCheckedChange={handleToggle("mcpEnabled")}
              disabled={!settings.aiEnabled || !settings.serverMcpEnabled || !settings.allowUserMcpToggle}
            />
          </div>

          <Separator />

          {/* Enable/Disable In-App AI */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="in-app-ai-enabled" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Enable In-App AI
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable AI features within the app (chat, smart suggestions).
              </p>
              {!settings.serverInAppAiEnabled && (
                <p className="text-xs text-muted-foreground italic">
                  Disabled by your administrator
                </p>
              )}
              {settings.serverInAppAiEnabled && !settings.allowUserInAppAiToggle && (
                <p className="text-xs text-muted-foreground italic">
                  Managed by your administrator
                </p>
              )}
            </div>
            <Switch
              id="in-app-ai-enabled"
              checked={settings.inAppAiEnabled}
              onCheckedChange={handleToggle("inAppAiEnabled")}
              disabled={!settings.aiEnabled || !settings.serverInAppAiEnabled || !settings.allowUserInAppAiToggle}
            />
          </div>

          {/* Sub-toggles for In-App AI */}
          {settings.inAppAiEnabled && (
            <>
              <div className="flex items-center justify-between pl-6">
                <div className="space-y-0.5">
                  <Label htmlFor="in-app-ai-chat-enabled">Enable AI Chat</Label>
                  <p className="text-xs text-muted-foreground">
                    Show the AI chat panel and sparkle button for in-app assistance.
                  </p>
                </div>
                <Switch
                  id="in-app-ai-chat-enabled"
                  checked={settings.inAppAiChatEnabled}
                  onCheckedChange={handleToggle("inAppAiChatEnabled")}
                  disabled={!settings.aiEnabled || !settings.inAppAiEnabled}
                />
              </div>

              <div className="flex items-center justify-between pl-6">
                <div className="space-y-0.5">
                  <Label htmlFor="in-app-ai-features-enabled">Enable AI Features</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable smart suggestions like AI task ordering.
                  </p>
                </div>
                <Switch
                  id="in-app-ai-features-enabled"
                  checked={settings.inAppAiFeaturesEnabled}
                  onCheckedChange={handleToggle("inAppAiFeaturesEnabled")}
                  disabled={!settings.aiEnabled || !settings.inAppAiEnabled}
                />
              </div>
            </>
          )}

          {settings.aiEnabled && settings.inAppAiEnabled && (
            <>
              <Separator />

              {/* API Key */}
              <ApiKeyInput
                hasApiKey={settings.hasApiKey}
                hasServerKey={settings.hasServerKey}
                apiKeyPreview={settings.apiKeyPreview}
                aiEnabled={settings.aiEnabled}
                onSaveKey={handleSaveKey}
                onClearKey={handleClearKey}
              />

              <Separator />

              {/* Usage */}
              <div className="space-y-3">
                <Label>Usage</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Messages today
                  </span>
                  <span className="text-sm font-medium">
                    {settings.aiMessagesUsedToday} / {settings.effectiveDailyLimit}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(
                        (settings.aiMessagesUsedToday / settings.effectiveDailyLimit) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Resets at</span>
                  <span className="text-sm font-medium">
                    {settings.aiLimitResetAt
                      ? new Date(settings.aiLimitResetAt).toLocaleString()
                      : "Midnight"}
                  </span>
                </div>
              </div>
            </>
          )}

          {settings.aiEnabled && (
            <>
              <Separator />

              {/* Privacy Controls — collapsible sub-section */}
              <Collapsible open={privacyOpen} onOpenChange={setPrivacyOpen}>
                <CollapsibleTrigger className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <Label className="cursor-pointer">Privacy Controls</Label>
                    <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${privacyOpen ? "rotate-0" : "-rotate-90"}`} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Control what the AI can access in your account.
                  </p>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-5 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-read-tasks">AI can read tasks</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow AI to access your tasks for context and suggestions.
                        </p>
                      </div>
                      <Switch
                        id="ai-read-tasks"
                        checked={settings.aiCanReadTasks}
                        onCheckedChange={handleToggle("aiCanReadTasks")}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-read-projects">AI can read projects</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow AI to access your project details and structure.
                        </p>
                      </div>
                      <Switch
                        id="ai-read-projects"
                        checked={settings.aiCanReadProjects}
                        onCheckedChange={handleToggle("aiCanReadProjects")}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-read-inbox">AI can read inbox items</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow AI to access items in your inbox.
                        </p>
                      </div>
                      <Switch
                        id="ai-read-inbox"
                        checked={settings.aiCanReadInbox}
                        onCheckedChange={handleToggle("aiCanReadInbox")}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-read-notes">AI can read notes/wiki</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow AI to access your wiki articles and notes.
                        </p>
                      </div>
                      <Switch
                        id="ai-read-notes"
                        checked={settings.aiCanReadNotes}
                        onCheckedChange={handleToggle("aiCanReadNotes")}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-modify">AI can create & modify data</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow AI to create tasks, projects, and modify existing items.
                        </p>
                      </div>
                      <Switch
                        id="ai-modify"
                        checked={settings.aiCanModify}
                        onCheckedChange={handleToggle("aiCanModify")}
                      />
                    </div>

                    <Separator />

                    {/* Default AI Visibility */}
                    <div className="space-y-2">
                      <Label htmlFor="ai-visibility">
                        Default AI Visibility for New Items
                      </Label>
                      <Select
                        value={settings.aiDefaultVisibility}
                        onValueChange={handleVisibilityChange}
                      >
                        <SelectTrigger id="ai-visibility" className="w-full max-w-xs">
                          <SelectValue placeholder="Select visibility" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VISIBLE">Visible</SelectItem>
                          <SelectItem value="READ_ONLY">Read-Only</SelectItem>
                          <SelectItem value="HIDDEN">Hidden</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        This sets the default AI visibility for newly created tasks,
                        projects, and inbox items.
                      </p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

    </div>
  );
}
