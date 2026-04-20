import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { encrypt, decrypt } from "@/lib/ai/crypto";
import { z } from "zod";

const aiSettingsUpdateSchema = z.object({
  aiEnabled: z.boolean().optional(),
  inAppAiEnabled: z.boolean().optional(),
  inAppAiChatEnabled: z.boolean().optional(),
  inAppAiFeaturesEnabled: z.boolean().optional(),
  mcpEnabled: z.boolean().optional(),
  aiCanReadTasks: z.boolean().optional(),
  aiCanReadProjects: z.boolean().optional(),
  aiCanReadInbox: z.boolean().optional(),
  aiCanReadNotes: z.boolean().optional(),
  aiCanModify: z.boolean().optional(),
  aiDefaultVisibility: z.enum(["VISIBLE", "HIDDEN", "READ_ONLY"]).optional(),
  aiDailyLimit: z.number().int().min(1).max(10000).nullable().optional(),
  apiKey: z.string().min(1).nullable().optional(),
});

/**
 * Mask an API key for safe display.
 * Returns first 6 + last 4 characters with "..." in between.
 */
function maskApiKey(key: string): string {
  if (key.length <= 10) {
    return key.substring(0, 3) + "..." + key.substring(key.length - 2);
  }
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
}

/**
 * Auth: session-only — this endpoint reads/writes third-party API keys.
 * Bearer access would allow key exfiltration from a compromised token.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiEnabled: true,
      inAppAiEnabled: true,
      inAppAiChatEnabled: true,
      inAppAiFeaturesEnabled: true,
      mcpEnabled: true,
      aiDailyLimit: true,
      aiMessagesUsedToday: true,
      aiLimitResetAt: true,
      aiCanReadTasks: true,
      aiCanReadProjects: true,
      aiCanReadInbox: true,
      aiCanReadNotes: true,
      aiCanModify: true,
      aiDefaultVisibility: true,
      anthropicApiKey: true,
    },
  });

  if (!user) return unauthorized();

  // Check if server key is configured
  const serverSettings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: {
      serverAiEnabled: true,
      shareServerKey: true,
      serverAnthropicApiKey: true,
      defaultAiDailyLimit: true,
      mcpEnabled: true,
      serverInAppAiEnabled: true,
      allowUserAiToggle: true,
      allowUserInAppAiToggle: true,
      allowUserMcpToggle: true,
    },
  });

  const hasUserApiKey = !!user.anthropicApiKey;
  const hasServerKey = !!(
    serverSettings?.serverAiEnabled &&
    serverSettings?.shareServerKey &&
    serverSettings?.serverAnthropicApiKey
  );

  // Determine effective daily limit
  const effectiveDailyLimit =
    user.aiDailyLimit ?? serverSettings?.defaultAiDailyLimit ?? 100;

  // Build API key preview (never return actual key)
  let apiKeyPreview: string | null = null;
  if (hasUserApiKey && user.anthropicApiKey) {
    const decrypted = decrypt(user.anthropicApiKey);
    if (decrypted) {
      apiKeyPreview = maskApiKey(decrypted);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anthropicApiKey, ...safeUser } = user;

  return NextResponse.json({
    ...safeUser,
    hasApiKey: hasUserApiKey,
    apiKeyPreview,
    hasServerKey,
    serverAiEnabled: serverSettings?.serverAiEnabled ?? false,
    serverInAppAiEnabled: serverSettings?.serverInAppAiEnabled ?? true,
    serverMcpEnabled: serverSettings?.mcpEnabled ?? true,
    allowUserAiToggle: serverSettings?.allowUserAiToggle ?? true,
    allowUserInAppAiToggle: serverSettings?.allowUserInAppAiToggle ?? true,
    allowUserMcpToggle: serverSettings?.allowUserMcpToggle ?? true,
    effectiveDailyLimit,
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const parsed = aiSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { apiKey, inAppAiEnabled, inAppAiChatEnabled, inAppAiFeaturesEnabled, mcpEnabled, ...settings } = parsed.data;

  // Fetch server settings to check admin locks
  const serverSettings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { serverInAppAiEnabled: true, allowUserAiToggle: true, allowUserInAppAiToggle: true, allowUserMcpToggle: true },
  });

  // Guard: reject aiEnabled changes if admin has locked the toggle
  if (settings.aiEnabled !== undefined && !serverSettings?.allowUserAiToggle) {
    return NextResponse.json(
      { error: "AI toggle is managed by your administrator" },
      { status: 403 }
    );
  }

  // Guard: reject inAppAiEnabled changes if admin has disabled or locked it
  if (inAppAiEnabled !== undefined) {
    if (!serverSettings?.serverInAppAiEnabled) {
      return NextResponse.json(
        { error: "In-app AI is disabled by your administrator" },
        { status: 403 }
      );
    }
    if (!serverSettings?.allowUserInAppAiToggle) {
      return NextResponse.json(
        { error: "In-app AI toggle is managed by your administrator" },
        { status: 403 }
      );
    }
  }

  // Guard: reject mcpEnabled changes if admin has locked the toggle
  if (mcpEnabled !== undefined && !serverSettings?.allowUserMcpToggle) {
    return NextResponse.json(
      { error: "MCP toggle is managed by your administrator" },
      { status: 403 }
    );
  }

  // Build the update data
  const updateData: Record<string, unknown> = {};

  // Copy over boolean/enum/number settings
  if (settings.aiEnabled !== undefined) updateData.aiEnabled = settings.aiEnabled;
  if (inAppAiEnabled !== undefined) updateData.inAppAiEnabled = inAppAiEnabled;
  if (inAppAiChatEnabled !== undefined) updateData.inAppAiChatEnabled = inAppAiChatEnabled;
  if (inAppAiFeaturesEnabled !== undefined) updateData.inAppAiFeaturesEnabled = inAppAiFeaturesEnabled;
  if (mcpEnabled !== undefined) updateData.mcpEnabled = mcpEnabled;
  if (settings.aiCanReadTasks !== undefined) updateData.aiCanReadTasks = settings.aiCanReadTasks;
  if (settings.aiCanReadProjects !== undefined) updateData.aiCanReadProjects = settings.aiCanReadProjects;
  if (settings.aiCanReadInbox !== undefined) updateData.aiCanReadInbox = settings.aiCanReadInbox;
  if (settings.aiCanReadNotes !== undefined) updateData.aiCanReadNotes = settings.aiCanReadNotes;
  if (settings.aiCanModify !== undefined) updateData.aiCanModify = settings.aiCanModify;
  if (settings.aiDefaultVisibility !== undefined) updateData.aiDefaultVisibility = settings.aiDefaultVisibility;
  if (settings.aiDailyLimit !== undefined) updateData.aiDailyLimit = settings.aiDailyLimit;

  // Handle API key: only process if explicitly included in body
  if (apiKey !== undefined) {
    if (apiKey === null) {
      // User wants to clear the key
      updateData.anthropicApiKey = null;
    } else {
      // Encrypt and store the new key
      updateData.anthropicApiKey = encrypt(apiKey);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      aiEnabled: true,
      inAppAiEnabled: true,
      inAppAiChatEnabled: true,
      inAppAiFeaturesEnabled: true,
      mcpEnabled: true,
      aiDailyLimit: true,
      aiMessagesUsedToday: true,
      aiLimitResetAt: true,
      aiCanReadTasks: true,
      aiCanReadProjects: true,
      aiCanReadInbox: true,
      aiCanReadNotes: true,
      aiCanModify: true,
      aiDefaultVisibility: true,
      anthropicApiKey: true,
    },
  });

  const hasApiKey = !!updatedUser.anthropicApiKey;

  // Build masked preview for response
  let patchApiKeyPreview: string | null = null;
  if (hasApiKey && updatedUser.anthropicApiKey) {
    const decrypted = decrypt(updatedUser.anthropicApiKey);
    if (decrypted) {
      patchApiKeyPreview = maskApiKey(decrypted);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anthropicApiKey: _key, ...safeUser } = updatedUser;

  return NextResponse.json({
    ...safeUser,
    hasApiKey,
    apiKeyPreview: patchApiKeyPreview,
  });
}
