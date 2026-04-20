"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  ChevronDown,
  ExternalLink,
  Globe,
  Heart,
  Home,
  Key,
  Lock,
  Mail,
  Palette,
  Server,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useServerSettings,
  type ServerSettings,
} from "@/lib/hooks/use-server-settings";

const AI_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-haiku-35-20241022", label: "Claude Haiku 3.5" },
];

/* ─── Branding & Landing Page ─── */

export function BrandingSettings() {
  const { settings, saving, setSettings, updateSettings } =
    useServerSettings();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5" />
              Branding &amp; Landing Page
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Customize your instance branding and landing page content
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Landing Mode */}
            <div className="space-y-2">
              <Label>Landing Mode</Label>
              <Select
                value={settings.landingMode}
                onValueChange={(value) =>
                  updateSettings({
                    landingMode: value as "FLAGSHIP" | "OPERATOR",
                  })
                }
                disabled={saving}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERATOR">Operator</SelectItem>
                  <SelectItem value="FLAGSHIP">Flagship</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Operator mode shows your branding with &quot;Powered by Tandem
                GTD&quot; footer. Flagship is for the official tandemgtd.com
                site.
              </p>
            </div>

            <Separator />

            {/* Instance Name */}
            <div className="space-y-2">
              <Label htmlFor="instance-name">Instance Name</Label>
              <Input
                id="instance-name"
                value={settings.instanceName}
                onChange={(e) =>
                  setSettings({ ...settings, instanceName: e.target.value })
                }
                onBlur={() =>
                  updateSettings({ instanceName: settings.instanceName })
                }
                disabled={saving}
                placeholder="Tandem GTD"
              />
              <p className="text-xs text-muted-foreground">
                Shown in the navbar, login page, and browser tab
              </p>
            </div>

            {/* Instance Tagline */}
            <div className="space-y-2">
              <Label htmlFor="instance-tagline">Tagline</Label>
              <Input
                id="instance-tagline"
                value={settings.instanceTagline}
                onChange={(e) =>
                  setSettings({ ...settings, instanceTagline: e.target.value })
                }
                onBlur={() =>
                  updateSettings({ instanceTagline: settings.instanceTagline })
                }
                disabled={saving}
                placeholder="A self-hosted GTD app that actually does GTD."
              />
            </div>

            {/* Instance Description */}
            <div className="space-y-2">
              <Label htmlFor="instance-desc">Description</Label>
              <Textarea
                id="instance-desc"
                value={settings.instanceDesc ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    instanceDesc: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ instanceDesc: settings.instanceDesc })
                }
                disabled={saving}
                placeholder="A longer description for the landing page..."
                rows={3}
              />
            </div>

            {/* Logo URL */}
            <div className="space-y-2">
              <Label htmlFor="instance-logo-url">Logo URL</Label>
              <Input
                id="instance-logo-url"
                type="url"
                value={settings.instanceLogoUrl ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    instanceLogoUrl: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ instanceLogoUrl: settings.instanceLogoUrl })
                }
                disabled={saving}
                placeholder="https://example.com/logo.png"
              />
            </div>

            {/* Accent Color */}
            <div className="space-y-2">
              <Label htmlFor="accent-color">Accent Color</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="accent-color"
                  value={settings.accentColor}
                  onChange={(e) =>
                    setSettings({ ...settings, accentColor: e.target.value })
                  }
                  onBlur={() =>
                    updateSettings({ accentColor: settings.accentColor })
                  }
                  disabled={saving}
                  placeholder="#6366f1"
                  className="w-40"
                />
                <div
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: settings.accentColor }}
                />
              </div>
            </div>

            {/* Operator Name + URL */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="operator-name">Operator Name</Label>
                <Input
                  id="operator-name"
                  value={settings.operatorName ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      operatorName: e.target.value || null,
                    })
                  }
                  onBlur={() =>
                    updateSettings({ operatorName: settings.operatorName })
                  }
                  disabled={saving}
                  placeholder="Your Name or Org"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operator-url">Operator URL</Label>
                <Input
                  id="operator-url"
                  type="url"
                  value={settings.operatorUrl ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      operatorUrl: e.target.value || null,
                    })
                  }
                  onBlur={() =>
                    updateSettings({ operatorUrl: settings.operatorUrl })
                  }
                  disabled={saving}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <Separator />

            {/* Content Blocks */}
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Landing Page Content</h4>
              <p className="text-xs text-muted-foreground">
                Override default content blocks. Leave empty to use
                mode-specific defaults.
              </p>
            </div>

            {/* Hero Heading */}
            <div className="space-y-2">
              <Label htmlFor="hero-heading">Hero Heading</Label>
              <Input
                id="hero-heading"
                value={settings.heroHeading ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    heroHeading: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ heroHeading: settings.heroHeading })
                }
                disabled={saving}
                placeholder="Your GTD system, your hardware, your rules."
              />
            </div>

            {/* Hero Description */}
            <div className="space-y-2">
              <Label htmlFor="hero-description">Hero Description</Label>
              <Textarea
                id="hero-description"
                value={settings.heroDescription ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    heroDescription: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ heroDescription: settings.heroDescription })
                }
                disabled={saving}
                placeholder="Describe your instance..."
                rows={3}
              />
            </div>

            {/* Feature Highlights */}
            <div className="space-y-2">
              <Label htmlFor="feature-highlights">
                Feature Highlights (JSON)
              </Label>
              <Textarea
                id="feature-highlights"
                value={settings.featureHighlights ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    featureHighlights: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({
                    featureHighlights: settings.featureHighlights,
                  })
                }
                disabled={saving}
                placeholder={
                  '[\n  {"title": "Feature", "description": "Description", "icon": "zap"}\n]'
                }
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                JSON array of up to 6 features. Each needs title, description,
                and icon (Lucide icon name).
              </p>
            </div>

            {/* CTA fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cta-heading">CTA Heading</Label>
                <Input
                  id="cta-heading"
                  value={settings.ctaHeading ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ctaHeading: e.target.value || null,
                    })
                  }
                  onBlur={() =>
                    updateSettings({ ctaHeading: settings.ctaHeading })
                  }
                  disabled={saving}
                  placeholder="Ready to get things done?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cta-button-text">CTA Button Text</Label>
                <Input
                  id="cta-button-text"
                  value={settings.ctaButtonText ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ctaButtonText: e.target.value || null,
                    })
                  }
                  onBlur={() =>
                    updateSettings({ ctaButtonText: settings.ctaButtonText })
                  }
                  disabled={saving}
                  placeholder="Get Started"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cta-description">CTA Description</Label>
              <Input
                id="cta-description"
                value={settings.ctaDescription ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ctaDescription: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ ctaDescription: settings.ctaDescription })
                }
                disabled={saving}
                placeholder="Stop fighting your tools..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cta-button-url">CTA Button URL</Label>
              <Input
                id="cta-button-url"
                type="url"
                value={settings.ctaButtonUrl ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ctaButtonUrl: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ ctaButtonUrl: settings.ctaButtonUrl })
                }
                disabled={saving}
                placeholder="/login"
              />
            </div>

            <Separator />

            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Preview Landing Page
            </a>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── Authentication ─── */

export function AuthSettings() {
  const { settings, saving, updateSettings } = useServerSettings();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Authentication
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Control how users sign in to your instance
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  updateSettings({
                    authMode: "OAUTH_ONLY",
                  } as Partial<ServerSettings>)
                }
                className={cn(
                  "rounded-lg border-2 p-4 text-left transition-colors",
                  settings.authMode === "OAUTH_ONLY"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30",
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="h-4 w-4" />
                  OAuth Only
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Users sign in exclusively via OAuth providers (Google, Apple,
                  GitHub, Microsoft). No passwords to manage.
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">
                  Recommended
                </Badge>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  updateSettings({
                    authMode: "OAUTH_AND_CREDENTIALS",
                  } as Partial<ServerSettings>)
                }
                className={cn(
                  "rounded-lg border-2 p-4 text-left transition-colors",
                  settings.authMode === "OAUTH_AND_CREDENTIALS"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30",
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Key className="h-4 w-4" />
                  OAuth + Password
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Users can sign in via OAuth or email/password. Admin can create
                  users with passwords directly.
                </p>
              </button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── Community Support ─── */

export function SupportSettings() {
  const { settings, saving, setSettings, updateSettings } =
    useServerSettings();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5" />
              Community Support
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Let users support the server with a donation link
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support-url">Support URL</Label>
              <Input
                id="support-url"
                type="url"
                value={settings.supportUrl ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    supportUrl: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({ supportUrl: settings.supportUrl })
                }
                disabled={saving}
                placeholder="https://buymeacoffee.com/yourname"
              />
              <p className="text-xs text-muted-foreground">
                When set, a &quot;Support this server&quot; link appears in the
                sidebar footer, help page, and landing page footer. Leave empty
                to hide.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── Features ─── */

export function FeaturesSettings() {
  const { settings, saving, updateSettings } = useServerSettings();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5" />
              Features
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Enable or disable optional features
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="api-access-enabled"
                  className="flex items-center gap-2"
                >
                  <Globe className="h-4 w-4" />
                  Public REST API
                </Label>
                <p className="text-sm text-muted-foreground">
                  Allow Bearer token authentication on all API routes for
                  external tools and scripts
                </p>
              </div>
              <Switch
                id="api-access-enabled"
                checked={settings.apiAccessEnabled}
                disabled={saving}
                onCheckedChange={(checked) =>
                  updateSettings({ apiAccessEnabled: checked })
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="landing-enabled"
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Landing Page
                </Label>
                <p className="text-sm text-muted-foreground">
                  Show a public landing page at / for unauthenticated visitors.
                  When disabled, visitors are redirected to the login page.
                </p>
              </div>
              <Switch
                id="landing-enabled"
                checked={settings.landingEnabled}
                disabled={saving}
                onCheckedChange={(checked) =>
                  updateSettings({ landingEnabled: checked })
                }
              />
            </div>

            <Separator />

            <FeatureVisibilityToggles
              disabledFeatures={settings.disabledFeatures}
              saving={saving}
              onUpdate={(disabledFeatures) => updateSettings({ disabledFeatures })}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const TOGGLEABLE_FEATURES = [
  { key: "dashboard", label: "Dashboard", description: "Overview dashboard with widgets" },
  { key: "insights", label: "Insights", description: "Analytics and trends" },
  { key: "cardFile", label: "Card File", description: "Recurring routine cards" },
  { key: "drift", label: "Drift", description: "Commitment drift analysis" },
  { key: "calendar", label: "Calendar", description: "Calendar and time blocking" },
  { key: "timeAudit", label: "Time Audit", description: "Time audit challenge" },
  { key: "wiki", label: "Wiki", description: "Knowledge base articles" },
];

type AdminFeatureState = "on" | "off" | "default_off";

function FeatureVisibilityToggles({
  disabledFeatures,
  saving,
  onUpdate,
}: {
  disabledFeatures: string | null | undefined;
  saving: boolean;
  onUpdate: (value: string) => void;
}) {
  let stateMap: Record<string, AdminFeatureState> = {};
  try {
    const parsed = disabledFeatures ? JSON.parse(disabledFeatures) : {};
    // Legacy: array format → convert
    if (Array.isArray(parsed)) {
      for (const k of parsed) if (typeof k === "string") stateMap[k] = "off";
    } else if (typeof parsed === "object" && parsed !== null) {
      stateMap = parsed;
    }
  } catch { stateMap = {}; }

  function setState(key: string, state: AdminFeatureState) {
    const next = { ...stateMap };
    if (state === "on") {
      delete next[key];
    } else {
      next[key] = state;
    }
    onUpdate(JSON.stringify(next));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">Feature Visibility</Label>
        <p className="text-sm text-muted-foreground">
          Control feature availability for all users.
        </p>
      </div>
      <div className="grid gap-2">
        {TOGGLEABLE_FEATURES.map((f) => {
          const current: AdminFeatureState = stateMap[f.key] || "on";
          return (
            <div key={f.key} className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-xs text-muted-foreground ml-2">{f.description}</span>
              </div>
              <Select
                value={current}
                disabled={saving}
                onValueChange={(v) => setState(f.key, v as AdminFeatureState)}
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="default_off">Off by default</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Email / SMTP ─── */

export function EmailSettings() {
  const { settings, saving, setSettings, updateSettings } =
    useServerSettings();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [smtpPassInput, setSmtpPassInput] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

  if (!settings) return null;

  async function saveSmtpPass() {
    if (!smtpPassInput.trim()) return;
    await updateSettings({
      smtpPass: smtpPassInput.trim(),
    } as Partial<ServerSettings>);
    setSmtpPassInput("");
  }

  async function clearSmtpPass() {
    await updateSettings({ smtpPass: null } as Partial<ServerSettings>);
    setSmtpPassInput("");
  }

  async function sendTestEmail() {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/admin/email-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to send test email");
      toast({ title: "Test email sent", description: data.message });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to send test email",
        variant: "destructive",
      });
    } finally {
      setTestingEmail(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Email / SMTP
              {settings.hasSmtpConfig && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Configured
                </Badge>
              )}
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Configure outbound email for notifications, waitlist alerts, and
              welcome emails
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {settings.smtpFromEnv && (
              <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                SMTP is configured via environment variables (SMTP_HOST, etc.).
                Database settings are overridden.
              </div>
            )}

            {/* SMTP Host */}
            <div className="space-y-2">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                value={settings.smtpHost ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smtpHost: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({
                    smtpHost: settings.smtpHost,
                  } as Partial<ServerSettings>)
                }
                disabled={saving || settings.smtpFromEnv}
                placeholder="smtp.example.com"
              />
            </div>

            {/* SMTP Port + TLS */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={settings.smtpPort ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      smtpPort: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  onBlur={() =>
                    updateSettings({
                      smtpPort: settings.smtpPort,
                    } as Partial<ServerSettings>)
                  }
                  disabled={saving || settings.smtpFromEnv}
                  placeholder="587"
                />
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label htmlFor="smtp-secure">Use TLS</Label>
                <Switch
                  id="smtp-secure"
                  checked={settings.smtpSecure}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      smtpSecure: checked,
                    } as Partial<ServerSettings>)
                  }
                  disabled={saving || settings.smtpFromEnv}
                />
              </div>
            </div>

            {/* SMTP User */}
            <div className="space-y-2">
              <Label htmlFor="smtp-user">Username</Label>
              <Input
                id="smtp-user"
                value={settings.smtpUser ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smtpUser: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({
                    smtpUser: settings.smtpUser,
                  } as Partial<ServerSettings>)
                }
                disabled={saving || settings.smtpFromEnv}
                placeholder="user@example.com"
              />
            </div>

            {/* SMTP Password */}
            <div className="space-y-2">
              <Label>Password</Label>
              {settings.smtpPass && (
                <p className="text-sm text-muted-foreground">
                  Current: {settings.smtpPass}
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="SMTP password"
                  value={smtpPassInput}
                  onChange={(e) => setSmtpPassInput(e.target.value)}
                  disabled={saving || settings.smtpFromEnv}
                />
                <Button
                  onClick={saveSmtpPass}
                  disabled={
                    saving || !smtpPassInput.trim() || settings.smtpFromEnv
                  }
                  size="sm"
                >
                  Save
                </Button>
                {settings.smtpPass && (
                  <Button
                    onClick={clearSmtpPass}
                    disabled={saving || settings.smtpFromEnv}
                    variant="outline"
                    size="sm"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* SMTP From */}
            <div className="space-y-2">
              <Label htmlFor="smtp-from">From Address</Label>
              <Input
                id="smtp-from"
                value={settings.smtpFrom ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smtpFrom: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({
                    smtpFrom: settings.smtpFrom,
                  } as Partial<ServerSettings>)
                }
                disabled={saving || settings.smtpFromEnv}
                placeholder="noreply@example.com"
              />
            </div>

            <Separator />

            {/* Test Email */}
            <div className="flex items-center gap-3">
              <Button
                onClick={sendTestEmail}
                disabled={testingEmail || !settings.hasSmtpConfig}
                variant="outline"
                size="sm"
              >
                {testingEmail ? "Sending..." : "Send Test Email"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Sends a test email to your admin email address.
              </p>
            </div>

            <Separator />

            {/* Email Templates */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Email Templates</h4>
              <p className="text-xs text-muted-foreground">
                Customize email content. Leave blank to use built-in defaults.
                Use {"{{variable}}"} placeholders.
              </p>

              {/* Waitlist Admin Alert */}
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Waitlist Admin Alert
                  </Label>
                  {(settings.emailWaitlistSubject !== null ||
                    settings.emailWaitlistBody !== null) && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => {
                        setSettings({
                          ...settings,
                          emailWaitlistSubject: null,
                          emailWaitlistBody: null,
                        });
                        updateSettings({
                          emailWaitlistSubject: null,
                          emailWaitlistBody: null,
                        } as Partial<ServerSettings>);
                      }}
                      disabled={saving}
                    >
                      Reset to default
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emailWaitlistSubject" className="text-xs">
                    Subject
                  </Label>
                  <Input
                    id="emailWaitlistSubject"
                    value={settings.emailWaitlistSubject ?? ""}
                    placeholder="New Tandem waitlist signup"
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        emailWaitlistSubject: e.target.value || null,
                      })
                    }
                    onBlur={() =>
                      updateSettings({
                        emailWaitlistSubject: settings.emailWaitlistSubject,
                      } as Partial<ServerSettings>)
                    }
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emailWaitlistBody" className="text-xs">
                    Body
                  </Label>
                  <Textarea
                    id="emailWaitlistBody"
                    rows={6}
                    value={settings.emailWaitlistBody ?? ""}
                    placeholder={
                      "New Tandem waitlist signup: {{name}} ({{email}})\n\nReview and promote from the admin panel:\n{{adminUrl}}"
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        emailWaitlistBody: e.target.value || null,
                      })
                    }
                    onBlur={() =>
                      updateSettings({
                        emailWaitlistBody: settings.emailWaitlistBody,
                      } as Partial<ServerSettings>)
                    }
                    disabled={saving}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Available variables:{" "}
                  <code className="text-xs">{"{{name}}"}</code>,{" "}
                  <code className="text-xs">{"{{email}}"}</code>,{" "}
                  <code className="text-xs">{"{{adminUrl}}"}</code>
                </p>
              </div>

              {/* Welcome Email */}
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Welcome Email</Label>
                  {(settings.emailWelcomeSubject !== null ||
                    settings.emailWelcomeBody !== null) && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => {
                        setSettings({
                          ...settings,
                          emailWelcomeSubject: null,
                          emailWelcomeBody: null,
                        });
                        updateSettings({
                          emailWelcomeSubject: null,
                          emailWelcomeBody: null,
                        } as Partial<ServerSettings>);
                      }}
                      disabled={saving}
                    >
                      Reset to default
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emailWelcomeSubject" className="text-xs">
                    Subject
                  </Label>
                  <Input
                    id="emailWelcomeSubject"
                    value={settings.emailWelcomeSubject ?? ""}
                    placeholder="Welcome to {{instanceName}}!"
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        emailWelcomeSubject: e.target.value || null,
                      })
                    }
                    onBlur={() =>
                      updateSettings({
                        emailWelcomeSubject: settings.emailWelcomeSubject,
                      } as Partial<ServerSettings>)
                    }
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emailWelcomeBody" className="text-xs">
                    Body
                  </Label>
                  <Textarea
                    id="emailWelcomeBody"
                    rows={6}
                    value={settings.emailWelcomeBody ?? ""}
                    placeholder={
                      "Hi {{name}},\n\nYou've been approved to join {{instanceName}}!\n\nSign in to get started:\n{{loginUrl}}\n{{setupUrl}}\n\n— {{instanceName}}"
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        emailWelcomeBody: e.target.value || null,
                      })
                    }
                    onBlur={() =>
                      updateSettings({
                        emailWelcomeBody: settings.emailWelcomeBody,
                      } as Partial<ServerSettings>)
                    }
                    disabled={saving}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Available variables:{" "}
                  <code className="text-xs">{"{{name}}"}</code>,{" "}
                  <code className="text-xs">{"{{instanceName}}"}</code>,{" "}
                  <code className="text-xs">{"{{loginUrl}}"}</code>,{" "}
                  <code className="text-xs">{"{{setupUrl}}"}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Note:{" "}
                  <code className="text-xs">{"{{setupUrl}}"}</code> is
                  only populated for non-OAuth (password) users.
                </p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── AI Configuration ─── */

export function AISettings() {
  const { settings, saving, updateSettings } =
    useServerSettings();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [dailyLimitInput, setDailyLimitInput] = useState("");

  // Sync dailyLimitInput when settings load
  const currentLimit = settings?.defaultAiDailyLimit;
  if (currentLimit !== undefined && dailyLimitInput === "") {
    setDailyLimitInput(String(currentLimit));
  }

  if (!settings) return null;

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    await updateSettings({
      serverAnthropicApiKey: apiKeyInput.trim(),
    } as Partial<ServerSettings>);
    setApiKeyInput("");
  }

  async function clearApiKey() {
    await updateSettings({
      serverAnthropicApiKey: null,
    } as Partial<ServerSettings>);
    setApiKeyInput("");
  }

  async function saveDailyLimit() {
    const limit = Number(dailyLimitInput);
    if (isNaN(limit) || limit <= 0) {
      toast({
        title: "Invalid limit",
        description: "Daily limit must be a positive number",
        variant: "destructive",
      });
      return;
    }
    await updateSettings({ defaultAiDailyLimit: limit });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              Server AI Configuration
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Configure AI features for all users on this server
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Master AI toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="server-ai-enabled">
                  Enable server-wide AI
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, AI features are available to users
                </p>
              </div>
              <Switch
                id="server-ai-enabled"
                checked={settings.serverAiEnabled}
                disabled={saving}
                onCheckedChange={(checked) =>
                  updateSettings({ serverAiEnabled: checked })
                }
              />
            </div>

            {/* In-App AI Chat */}
            <div className="flex items-center justify-between pl-6">
              <div className="space-y-0.5">
                <Label
                  htmlFor="server-inapp-ai-enabled"
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  In-App AI
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable in-app AI features for all users (chat, smart
                  suggestions)
                </p>
              </div>
              <Switch
                id="server-inapp-ai-enabled"
                checked={settings.serverInAppAiEnabled}
                disabled={saving || !settings.serverAiEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ serverInAppAiEnabled: checked })
                }
              />
            </div>

            {/* Allow users to toggle in-app AI */}
            <div
              className={cn(
                "flex items-center justify-between pl-12",
                (!settings.serverAiEnabled ||
                  !settings.serverInAppAiEnabled) &&
                  "opacity-50",
              )}
            >
              <div className="space-y-0.5">
                <Label htmlFor="allow-user-inapp-ai-toggle">
                  Allow users to toggle in-app AI
                </Label>
                <p className="text-sm text-muted-foreground">
                  When disabled, users cannot turn off the in-app AI chat panel
                  themselves
                </p>
              </div>
              <Switch
                id="allow-user-inapp-ai-toggle"
                checked={settings.allowUserInAppAiToggle}
                disabled={
                  saving ||
                  !settings.serverAiEnabled ||
                  !settings.serverInAppAiEnabled
                }
                onCheckedChange={(checked) =>
                  updateSettings({ allowUserInAppAiToggle: checked })
                }
              />
            </div>

            {/* MCP Server */}
            <div className="flex items-center justify-between pl-6">
              <div className="space-y-0.5">
                <Label
                  htmlFor="mcp-enabled"
                  className="flex items-center gap-2"
                >
                  <Server className="h-4 w-4" />
                  MCP Server
                </Label>
                <p className="text-sm text-muted-foreground">
                  Allow external AI tools to connect via MCP protocol
                </p>
              </div>
              <Switch
                id="mcp-enabled"
                checked={settings.mcpEnabled}
                disabled={saving || !settings.serverAiEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ mcpEnabled: checked })
                }
              />
            </div>

            {/* Allow users to toggle MCP access */}
            <div
              className={cn(
                "flex items-center justify-between pl-12",
                (!settings.serverAiEnabled || !settings.mcpEnabled) &&
                  "opacity-50",
              )}
            >
              <div className="space-y-0.5">
                <Label htmlFor="allow-user-mcp-toggle">
                  Allow users to toggle MCP access
                </Label>
                <p className="text-sm text-muted-foreground">
                  When disabled, users cannot turn off MCP connections themselves
                </p>
              </div>
              <Switch
                id="allow-user-mcp-toggle"
                checked={settings.allowUserMcpToggle}
                disabled={
                  saving || !settings.serverAiEnabled || !settings.mcpEnabled
                }
                onCheckedChange={(checked) =>
                  updateSettings({ allowUserMcpToggle: checked })
                }
              />
            </div>

            {/* Allow users to opt out of AI entirely */}
            <div className="flex items-center justify-between pl-6">
              <div className="space-y-0.5">
                <Label htmlFor="allow-user-ai-toggle">
                  Allow users to opt out of AI entirely
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, users can disable all AI features for their
                  account
                </p>
              </div>
              <Switch
                id="allow-user-ai-toggle"
                checked={settings.allowUserAiToggle}
                disabled={saving || !settings.serverAiEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ allowUserAiToggle: checked })
                }
              />
            </div>

            <Separator />

            {/* Server API Key */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <Label>Server API Key (shared)</Label>
              </div>
              {settings.hasServerKey && (
                <p className="text-sm text-muted-foreground">
                  Current key: {settings.serverAnthropicApiKey}
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  disabled={saving}
                />
                <Button
                  onClick={saveApiKey}
                  disabled={saving || !apiKeyInput.trim()}
                  size="sm"
                >
                  Save
                </Button>
                {settings.hasServerKey && (
                  <Button
                    onClick={clearApiKey}
                    disabled={saving}
                    variant="outline"
                    size="sm"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                This key is used when users don&apos;t have their own
              </p>
            </div>

            <Separator />

            {/* Key sharing toggles */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="allow-user-keys">
                  Allow users to bring their own API keys
                </Label>
                <p className="text-sm text-muted-foreground">
                  Users can configure their own Anthropic API key
                </p>
              </div>
              <Switch
                id="allow-user-keys"
                checked={settings.allowUserOwnKeys}
                disabled={saving}
                onCheckedChange={(checked) =>
                  updateSettings({ allowUserOwnKeys: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="share-server-key">
                  Share server key with non-admin users
                </Label>
                <p className="text-sm text-muted-foreground">
                  Non-admin users can use the server API key for AI features
                </p>
              </div>
              <Switch
                id="share-server-key"
                checked={settings.shareServerKey}
                disabled={saving}
                onCheckedChange={(checked) =>
                  updateSettings({ shareServerKey: checked })
                }
              />
            </div>

            <Separator />

            {/* Daily limit */}
            <div className="space-y-3">
              <Label htmlFor="daily-limit">Default Daily Message Limit</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="daily-limit"
                  type="number"
                  min="1"
                  className="w-32"
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(e.target.value)}
                  disabled={saving}
                />
                <Button
                  onClick={saveDailyLimit}
                  disabled={
                    saving ||
                    dailyLimitInput === String(settings.defaultAiDailyLimit)
                  }
                  size="sm"
                  variant="outline"
                >
                  Update
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum AI messages per user per day (can be overridden per
                user)
              </p>
            </div>

            {/* Default model */}
            <div className="space-y-3">
              <Label>Default AI Model</Label>
              <Select
                value={settings.defaultAiModel}
                onValueChange={(value) =>
                  updateSettings({ defaultAiModel: value })
                }
                disabled={saving}
              >
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── Teams ─── */

export function TeamsSettings() {
  const { settings, saving, updateSettings } = useServerSettings();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UsersRound className="h-5 w-5" />
              Teams
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Configure team collaboration features
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="teams-enabled">Enable Teams</Label>
                <p className="text-sm text-muted-foreground">
                  Allow users to view and collaborate in teams
                </p>
              </div>
              <Switch
                id="teams-enabled"
                checked={settings.teamsEnabled}
                disabled={saving}
                onCheckedChange={(checked) =>
                  updateSettings({ teamsEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="teams-admin-only">
                  Restrict team creation to admins
                </Label>
                <p className="text-sm text-muted-foreground">
                  Only server administrators can create new teams
                </p>
              </div>
              <Switch
                id="teams-admin-only"
                checked={settings.teamsAdminOnly}
                disabled={saving || !settings.teamsEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ teamsAdminOnly: checked })
                }
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── Data Retention ─── */

export function RetentionSettings() {
  const { settings, saving, setSettings, updateSettings } =
    useServerSettings();
  const [open, setOpen] = useState(false);

  if (!settings) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-5 w-5" />
              Data Retention
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
              />
            </CardTitle>
            <CardDescription>
              Auto-purge completed projects after a configurable period
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Retention</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, completed/dropped projects are automatically
                  scheduled for deletion
                </p>
              </div>
              <Switch
                checked={settings.retentionEnabled}
                onCheckedChange={(checked) => {
                  setSettings({ ...settings, retentionEnabled: checked });
                  updateSettings({ retentionEnabled: checked });
                }}
                disabled={saving}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retention-period">
                  Retention Period (days)
                </Label>
                <Input
                  id="retention-period"
                  type="number"
                  min={1}
                  max={3650}
                  value={settings.retentionPeriodDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retentionPeriodDays: Number(e.target.value),
                    })
                  }
                  onBlur={() =>
                    updateSettings({
                      retentionPeriodDays: settings.retentionPeriodDays,
                    })
                  }
                  disabled={saving || !settings.retentionEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Days after completion before scheduling purge
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="retention-grace">Grace Period (days)</Label>
                <Input
                  id="retention-grace"
                  type="number"
                  min={1}
                  max={365}
                  value={settings.retentionGraceDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retentionGraceDays: Number(e.target.value),
                    })
                  }
                  onBlur={() =>
                    updateSettings({
                      retentionGraceDays: settings.retentionGraceDays,
                    })
                  }
                  disabled={saving || !settings.retentionEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Days between warning and actual deletion
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retention-export-path">Export Path</Label>
              <Input
                id="retention-export-path"
                value={settings.retentionExportPath ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retentionExportPath: e.target.value || null,
                  })
                }
                onBlur={() =>
                  updateSettings({
                    retentionExportPath: settings.retentionExportPath,
                  })
                }
                disabled={saving || !settings.retentionEnabled}
                placeholder="/var/lib/tandem/retention-exports"
              />
              <p className="text-xs text-muted-foreground">
                Directory for JSON/CSV exports before deletion. Leave empty to
                skip exports.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retention-export-keep">
                  Keep Exports (days)
                </Label>
                <Input
                  id="retention-export-keep"
                  type="number"
                  min={1}
                  max={3650}
                  value={settings.retentionExportKeepDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retentionExportKeepDays: Number(e.target.value),
                    })
                  }
                  onBlur={() =>
                    updateSettings({
                      retentionExportKeepDays:
                        settings.retentionExportKeepDays,
                    })
                  }
                  disabled={saving || !settings.retentionEnabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retention-batch">Batch Size</Label>
                <Input
                  id="retention-batch"
                  type="number"
                  min={1}
                  max={100}
                  value={settings.retentionBatchSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retentionBatchSize: Number(e.target.value),
                    })
                  }
                  onBlur={() =>
                    updateSettings({
                      retentionBatchSize: settings.retentionBatchSize,
                    })
                  }
                  disabled={saving || !settings.retentionEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Max projects processed per cron run
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Include Standalone Tasks</Label>
                <p className="text-xs text-muted-foreground">
                  Also purge completed standalone tasks (not in any project)
                </p>
              </div>
              <Switch
                checked={settings.retentionStandaloneTasks}
                onCheckedChange={(checked) => {
                  setSettings({
                    ...settings,
                    retentionStandaloneTasks: checked,
                  });
                  updateSettings({ retentionStandaloneTasks: checked });
                }}
                disabled={saving || !settings.retentionEnabled}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ─── Loading / Error states ─── */

function SettingsLoading() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5" />
          Server AI Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </CardContent>
    </Card>
  );
}

function SettingsError() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5" />
          Server AI Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-destructive">
          Failed to load server settings.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─── Backwards-compatible barrel export ─── */

export function ServerSettingsForm() {
  const { settings, loading } = useServerSettings();

  if (loading) return <SettingsLoading />;
  if (!settings) return <SettingsError />;

  return (
    <>
      <BrandingSettings />
      <AuthSettings />
      <SupportSettings />
      <EmailSettings />
      <AISettings />
      <TeamsSettings />
      <FeaturesSettings />
      <RetentionSettings />
    </>
  );
}
