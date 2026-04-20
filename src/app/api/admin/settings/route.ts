import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { encrypt } from "@/lib/ai/crypto";
import { invalidateTeamSettingsCache } from "@/lib/api/team-settings";
import { isSmtpConfigured } from "@/lib/email";

function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "****";
  return key.substring(0, 7) + "..." + key.substring(key.length - 4);
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
  });

  const hasSmtpConfig = await isSmtpConfigured();
  const smtpFromEnv = !!process.env.SMTP_HOST;

  if (!settings) {
    // Return defaults if no settings row exists yet
    return NextResponse.json({
      id: "singleton",
      serverAnthropicApiKey: null,
      hasServerKey: false,
      serverAiEnabled: false,
      allowUserOwnKeys: true,
      shareServerKey: false,
      defaultAiDailyLimit: 100,
      defaultAiModel: "claude-sonnet-4-20250514",
      mcpEnabled: true,
      serverInAppAiEnabled: true,
      allowUserAiToggle: true,
      allowUserInAppAiToggle: true,
      allowUserMcpToggle: true,
      teamsEnabled: true,
      teamsAdminOnly: true,
      apiAccessEnabled: false,
      landingEnabled: true,
      registrationMode: "WAITLIST",
      authMode: "OAUTH_AND_CREDENTIALS",
      maxInviteCodesPerUser: 2,
      trialDurationDays: 30,
      landingMode: "OPERATOR",
      instanceName: "Tandem GTD",
      instanceTagline: "A self-hosted GTD app that actually does GTD.",
      instanceDesc: null,
      instanceLogoUrl: null,
      accentColor: "#6366f1",
      operatorName: null,
      operatorUrl: null,
      heroHeading: null,
      heroDescription: null,
      featureHighlights: null,
      ctaHeading: null,
      ctaDescription: null,
      ctaButtonText: null,
      ctaButtonUrl: null,
      supportUrl: null,
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPass: null,
      smtpFrom: null,
      smtpSecure: true,
      emailWaitlistSubject: null,
      emailWaitlistBody: null,
      emailWelcomeSubject: null,
      emailWelcomeBody: null,
      hasSmtpConfig,
      smtpFromEnv,
      updatedAt: null,
    });
  }

  return NextResponse.json({
    ...settings,
    serverAnthropicApiKey: maskApiKey(settings.serverAnthropicApiKey),
    hasServerKey: !!settings.serverAnthropicApiKey,
    smtpPass: settings.smtpPass ? "••••••••" : null,
    hasSmtpConfig,
    smtpFromEnv,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();

  const allowedFields = [
    "serverAiEnabled",
    "allowUserOwnKeys",
    "shareServerKey",
    "defaultAiDailyLimit",
    "defaultAiModel",
    "mcpEnabled",
    "serverInAppAiEnabled",
    "allowUserAiToggle",
    "allowUserInAppAiToggle",
    "allowUserMcpToggle",
    "teamsEnabled",
    "teamsAdminOnly",
    "apiAccessEnabled",
    "landingEnabled",
    "registrationMode",
    "authMode",
    "maxInviteCodesPerUser",
    "trialDurationDays",
    "serverAnthropicApiKey",
    "landingMode",
    "instanceName",
    "instanceTagline",
    "instanceDesc",
    "instanceLogoUrl",
    "accentColor",
    "operatorName",
    "operatorUrl",
    "heroHeading",
    "heroDescription",
    "featureHighlights",
    "ctaHeading",
    "ctaDescription",
    "ctaButtonText",
    "ctaButtonUrl",
    "supportUrl",
    "smtpHost",
    "smtpPort",
    "smtpUser",
    "smtpPass",
    "smtpFrom",
    "smtpSecure",
    "emailWaitlistSubject",
    "emailWaitlistBody",
    "emailWelcomeSubject",
    "emailWelcomeBody",
    "retentionEnabled",
    "retentionPeriodDays",
    "retentionGraceDays",
    "retentionExportPath",
    "retentionExportKeepDays",
    "retentionStandaloneTasks",
    "retentionBatchSize",
    "disabledFeatures",
  ];

  const data: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      if (field === "serverAnthropicApiKey" || field === "smtpPass") {
        // Handle encrypted fields: null to clear, string to encrypt and save
        if (body[field] === null) {
          data[field] = null;
        } else if (typeof body[field] === "string" && body[field].trim()) {
          data[field] = encrypt(body[field].trim());
        }
      } else if (field === "smtpPort") {
        const port = Number(body[field]);
        if (!isNaN(port) && port > 0 && port <= 65535) {
          data[field] = port;
        }
      } else if (field === "smtpHost" || field === "smtpUser" || field === "smtpFrom") {
        // String fields: allow null/empty to clear
        const val = body[field];
        if (val === null || val === "") {
          data[field] = null;
        } else if (typeof val === "string") {
          data[field] = val.trim();
        }
      } else if (field === "trialDurationDays") {
        const days = Number(body[field]);
        if (!isNaN(days) && days >= 1 && days <= 365) {
          data[field] = days;
        }
      } else if (field === "defaultAiDailyLimit" || field === "maxInviteCodesPerUser") {
        const limit = Number(body[field]);
        if (!isNaN(limit) && limit > 0) {
          data[field] = limit;
        }
      } else if (field === "emailWaitlistSubject" || field === "emailWelcomeSubject") {
        // Email subject templates: null to clear, string with length cap
        const val = body[field];
        if (val === null || val === "") {
          data[field] = null;
        } else if (typeof val === "string") {
          data[field] = val.trim().slice(0, 500) || null;
        }
      } else if (field === "emailWaitlistBody" || field === "emailWelcomeBody") {
        // Email body templates: null to clear, string with length cap
        const val = body[field];
        if (val === null || val === "") {
          data[field] = null;
        } else if (typeof val === "string") {
          data[field] = val.trim().slice(0, 10000) || null;
        }
      } else if (field === "retentionPeriodDays" || field === "retentionGraceDays" || field === "retentionExportKeepDays" || field === "retentionBatchSize") {
        const val = Number(body[field]);
        if (!isNaN(val) && val >= 1 && val <= 3650) {
          data[field] = val;
        }
      } else if (field === "retentionExportPath") {
        const val = body[field];
        if (val === null || val === "") {
          data[field] = null;
        } else if (typeof val === "string") {
          data[field] = val.trim();
        }
      } else if (["supportUrl", "operatorUrl", "ctaButtonUrl", "instanceLogoUrl"].includes(field)) {
        // URL fields: allow null/empty to clear, validate URL format otherwise
        const val = body[field];
        if (val === null || val === "") {
          data[field] = null;
        } else if (typeof val === "string") {
          try {
            new URL(val);
            data[field] = val;
          } catch {
            // Skip invalid URLs silently
          }
        }
      } else {
        data[field] = body[field];
      }
    }
  }

  // Safety check: block TRIAL mode unless landingMode is FLAGSHIP
  if (data.registrationMode === "TRIAL") {
    const currentSettings = await prisma.serverSettings.findUnique({
      where: { id: "singleton" },
      select: { landingMode: true },
    });
    const effectiveLandingMode = (data.landingMode as string) ?? currentSettings?.landingMode ?? "OPERATOR";
    if (effectiveLandingMode !== "FLAGSHIP") {
      return NextResponse.json(
        { error: "Trial registration mode is only available for flagship instances." },
        { status: 400 }
      );
    }
  }

  // Safety check: block OAUTH_ONLY if no providers configured or admin has no OAuth
  if (data.authMode === "OAUTH_ONLY") {
    const hasAnyProvider =
      !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
      !!(process.env.APPLE_ID && process.env.APPLE_SECRET) ||
      !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) ||
      !!(process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET);

    if (!hasAnyProvider) {
      return NextResponse.json(
        { error: "Cannot enable OAuth-only mode: no OAuth providers are configured. Set up at least one provider's environment variables first." },
        { status: 400 }
      );
    }

    const adminsWithoutOAuth = await prisma.user.findMany({
      where: {
        isAdmin: true,
        isDisabled: false,
        accounts: { none: {} },
      },
      select: { id: true, name: true, email: true },
    });

    if (adminsWithoutOAuth.length > 0) {
      const names = adminsWithoutOAuth.map((u) => u.name || u.email).join(", ");
      return NextResponse.json(
        { error: `Cannot enable OAuth-only mode: the following admin(s) have no linked OAuth account and would be locked out: ${names}. They must link an OAuth provider first.` },
        { status: 400 }
      );
    }
  }

  const settings = await prisma.serverSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: {
      id: "singleton",
      ...data,
    },
  });

  if ("teamsEnabled" in data || "teamsAdminOnly" in data) {
    invalidateTeamSettingsCache();
  }

  const updatedHasSmtp = await isSmtpConfigured();

  return NextResponse.json({
    ...settings,
    serverAnthropicApiKey: maskApiKey(settings.serverAnthropicApiKey),
    hasServerKey: !!settings.serverAnthropicApiKey,
    smtpPass: settings.smtpPass ? "••••••••" : null,
    hasSmtpConfig: updatedHasSmtp,
    smtpFromEnv: !!process.env.SMTP_HOST,
  });
}
