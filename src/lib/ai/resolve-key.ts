import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/ai/crypto";
export { encrypt } from "@/lib/ai/crypto";

export interface AIConfig {
  apiKey: string;
  model: string;
  source: "user" | "server";
  dailyLimit: number;
  messagesUsedToday: number;
}

/**
 * Resolve which Anthropic API key to use for a given user.
 *
 * Priority:
 * 1. User's own API key (if set and allowUserOwnKeys is true)
 * 2. Server shared key (if shareServerKey is true or user is admin)
 * 3. null — AI features unavailable
 */
export async function resolveAIConfig(
  userId: string
): Promise<AIConfig | null> {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        anthropicApiKey: true,
        aiEnabled: true,
        aiDailyLimit: true,
        aiMessagesUsedToday: true,
        aiLimitResetAt: true,
        isAdmin: true,
      },
    }),
    getServerSettings(),
  ]);

  if (!user || !user.aiEnabled) return null;

  // Reset daily counter if needed
  const now = new Date();
  let messagesUsed = user.aiMessagesUsedToday;
  if (user.aiLimitResetAt && now > user.aiLimitResetAt) {
    messagesUsed = 0;
    await prisma.user.update({
      where: { id: userId },
      data: {
        aiMessagesUsedToday: 0,
        aiLimitResetAt: getNextMidnight(),
      },
    });
  }

  const dailyLimit = user.aiDailyLimit ?? settings.defaultAiDailyLimit;
  const model = settings.defaultAiModel;

  // 1. Try user's own key
  if (user.anthropicApiKey && settings.allowUserOwnKeys) {
    const apiKey = decrypt(user.anthropicApiKey);
    if (apiKey) {
      return {
        apiKey,
        model,
        source: "user",
        dailyLimit,
        messagesUsedToday: messagesUsed,
      };
    }
  }

  // 2. Try server shared key
  if (settings.serverAnthropicApiKey && settings.serverAiEnabled) {
    // Server key available to admins always, to others only if shareServerKey
    if (user.isAdmin || settings.shareServerKey) {
      const apiKey = decrypt(settings.serverAnthropicApiKey);
      if (apiKey) {
        return {
          apiKey,
          model,
          source: "server",
          dailyLimit,
          messagesUsedToday: messagesUsed,
        };
      }
    }
  }

  // 3. Fallback: check ANTHROPIC_API_KEY env var (for simple single-user setups)
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return {
      apiKey: envKey,
      model,
      source: "server",
      dailyLimit,
      messagesUsedToday: messagesUsed,
    };
  }

  return null;
}

/**
 * Increment the daily message counter for a user.
 */
export async function incrementAIUsage(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      aiMessagesUsedToday: { increment: 1 },
      aiLimitResetAt: {
        set: await prisma.user
          .findUnique({ where: { id: userId }, select: { aiLimitResetAt: true } })
          .then((u) => u?.aiLimitResetAt ?? getNextMidnight()),
      },
    },
  });
}

/**
 * Check if a user has exceeded their daily AI message limit.
 */
export async function checkAILimit(userId: string): Promise<boolean> {
  const config = await resolveAIConfig(userId);
  if (!config) return false;
  return config.messagesUsedToday < config.dailyLimit;
}

// Cache server settings for 60 seconds
let settingsCache: { data: ServerSettingsData; expiry: number } | null = null;

interface ServerSettingsData {
  serverAnthropicApiKey: string | null;
  serverAiEnabled: boolean;
  allowUserOwnKeys: boolean;
  shareServerKey: boolean;
  defaultAiDailyLimit: number;
  defaultAiModel: string;
  mcpEnabled: boolean;
  allowUserAiToggle: boolean;
  allowUserMcpToggle: boolean;
  teamsEnabled: boolean;
  teamsAdminOnly: boolean;
}

async function getServerSettings(): Promise<ServerSettingsData> {
  const now = Date.now();
  if (settingsCache && now < settingsCache.expiry) {
    return settingsCache.data;
  }

  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
  });

  const data: ServerSettingsData = settings ?? {
    serverAnthropicApiKey: null,
    serverAiEnabled: false,
    allowUserOwnKeys: true,
    shareServerKey: false,
    defaultAiDailyLimit: 100,
    defaultAiModel: "claude-sonnet-4-20250514",
    mcpEnabled: true,
    allowUserAiToggle: true,
    allowUserMcpToggle: true,
    teamsEnabled: true,
    teamsAdminOnly: true,
  };

  settingsCache = { data, expiry: now + 60_000 };
  return data;
}

function getNextMidnight(): Date {
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow;
}
