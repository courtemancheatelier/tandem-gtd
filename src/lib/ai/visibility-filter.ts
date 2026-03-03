import { prisma } from "@/lib/prisma";
import { AIVisibility } from "@prisma/client";

/**
 * AI Visibility Filter
 *
 * Determines what data the AI can access for a given user.
 * Respects three levels of control:
 *
 * 1. User-level: aiEnabled=false → AI sees nothing
 * 2. Category-level: aiCanReadTasks=false → AI sees no tasks
 * 3. Item-level: task.aiVisibility=HIDDEN → AI skips this specific task
 */

export interface AIPermissions {
  enabled: boolean;
  canReadTasks: boolean;
  canReadProjects: boolean;
  canReadInbox: boolean;
  canReadNotes: boolean;
  canModify: boolean;
  defaultVisibility: AIVisibility;
}

/**
 * Load the AI permissions for a user.
 */
export async function getAIPermissions(userId: string): Promise<AIPermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiEnabled: true,
      aiCanReadTasks: true,
      aiCanReadProjects: true,
      aiCanReadInbox: true,
      aiCanReadNotes: true,
      aiCanModify: true,
      aiDefaultVisibility: true,
    },
  });

  if (!user) {
    return {
      enabled: false,
      canReadTasks: false,
      canReadProjects: false,
      canReadInbox: false,
      canReadNotes: false,
      canModify: false,
      defaultVisibility: "VISIBLE",
    };
  }

  return {
    enabled: user.aiEnabled,
    canReadTasks: user.aiEnabled && user.aiCanReadTasks,
    canReadProjects: user.aiEnabled && user.aiCanReadProjects,
    canReadInbox: user.aiEnabled && user.aiCanReadInbox,
    canReadNotes: user.aiEnabled && user.aiCanReadNotes,
    canModify: user.aiEnabled && user.aiCanModify,
    defaultVisibility: user.aiDefaultVisibility,
  };
}

/**
 * Prisma `where` clause addition to filter out AI-hidden items.
 * Use this in every AI-facing query.
 */
export function aiVisibleWhere() {
  return { aiVisibility: { not: "HIDDEN" as AIVisibility } };
}

/**
 * Check if a specific item is modifiable by AI.
 */
export function isAIModifiable(
  itemVisibility: AIVisibility,
  permissions: AIPermissions
): boolean {
  if (!permissions.enabled || !permissions.canModify) return false;
  if (itemVisibility === "HIDDEN") return false;
  if (itemVisibility === "READ_ONLY") return false;
  return true;
}

/**
 * Strip sensitive fields from records before sending to AI.
 * Removes notes content from READ_ONLY items.
 */
export function sanitizeForAI<T extends Record<string, unknown>>(
  record: T,
  visibility: AIVisibility
): T {
  if (visibility === "READ_ONLY") {
    const sanitized = { ...record };
    if ("notes" in sanitized) (sanitized as Record<string, unknown>).notes = "[hidden from AI]";
    return sanitized;
  }
  return record;
}
