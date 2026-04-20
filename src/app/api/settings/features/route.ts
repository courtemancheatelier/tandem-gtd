import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

// All toggleable features with display metadata
const TOGGLEABLE_FEATURES = [
  { key: "dashboard", label: "Dashboard", description: "Overview dashboard with widgets" },
  { key: "insights", label: "Insights", description: "Analytics and trends" },
  { key: "cardFile", label: "Card File", description: "Recurring routine cards" },
  { key: "drift", label: "Drift", description: "Commitment drift analysis" },
  { key: "calendar", label: "Calendar", description: "Calendar and time blocking" },
  { key: "timeAudit", label: "Time Audit", description: "Time audit challenge" },
  { key: "wiki", label: "Wiki", description: "Knowledge base articles" },
] as const;

type AdminState = "on" | "off" | "default_off";

/**
 * Parse server disabledFeatures JSON.
 * Supports both legacy format (string[]) and new format (Record<string, AdminState>).
 */
function parseServerFeatures(json: string | null): Record<string, AdminState> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    // Legacy: ["cardFile", "drift"] → treat as "off"
    if (Array.isArray(parsed)) {
      const map: Record<string, AdminState> = {};
      for (const k of parsed) if (typeof k === "string") map[k] = "off";
      return map;
    }
    // New: { cardFile: "off", drift: "default_off" }
    if (typeof parsed === "object" && parsed !== null) {
      const map: Record<string, AdminState> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v === "off" || v === "default_off") map[k] = v;
      }
      return map;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Parse user feature preferences JSON.
 * Supports both legacy format (string[] of hidden keys) and new format (Record<string, boolean>).
 * In new format: true = user wants it shown, false = user wants it hidden.
 */
function parseUserPreferences(json: string | null): Record<string, boolean> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    // Legacy: ["cardFile"] → treat as { cardFile: false }
    if (Array.isArray(parsed)) {
      const map: Record<string, boolean> = {};
      for (const k of parsed) if (typeof k === "string") map[k] = false;
      return map;
    }
    // New: { cardFile: false, wiki: true }
    if (typeof parsed === "object" && parsed !== null) {
      const map: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "boolean") map[k] = v;
      }
      return map;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Compute visibility:
 * - "on"          → visible unless user explicitly hid it (pref === false)
 * - "off"         → always hidden, user can't override
 * - "default_off" → hidden unless user explicitly enabled it (pref === true)
 */
function computeVisibility(
  adminState: AdminState,
  userPref: boolean | undefined
): boolean {
  if (adminState === "off") return false;
  if (adminState === "default_off") return userPref === true;
  // adminState === "on"
  return userPref !== false;
}

/**
 * GET /api/settings/features
 * Returns feature visibility for the current user (merged server + user level).
 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const [settings, user] = await Promise.all([
    prisma.serverSettings.findFirst({
      select: { apiAccessEnabled: true, disabledFeatures: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { hiddenFeatures: true },
    }),
  ]);

  const serverMap = parseServerFeatures(settings?.disabledFeatures ?? null);
  const userPrefs = parseUserPreferences(user?.hiddenFeatures ?? null);

  const features = TOGGLEABLE_FEATURES.map((f) => {
    const adminState: AdminState = serverMap[f.key] || "on";
    const userPref = userPrefs[f.key];
    return {
      key: f.key,
      label: f.label,
      description: f.description,
      adminState,
      userEnabled: userPref ?? null,
      visible: computeVisibility(adminState, userPref),
    };
  });

  return NextResponse.json({
    features,
    apiAccessEnabled: settings?.apiAccessEnabled ?? false,
  });
}

/**
 * PATCH /api/settings/features
 * Update user's feature preferences.
 * Body: { preferences: Record<string, boolean> }
 *   true = user wants it shown, false = user wants it hidden
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const { preferences } = body;

  if (typeof preferences !== "object" || preferences === null) {
    return NextResponse.json({ error: "preferences must be an object" }, { status: 400 });
  }

  const validKeys: string[] = TOGGLEABLE_FEATURES.map((f) => f.key);
  const filtered: Record<string, boolean> = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(preferences)) {
    if (validKeys.includes(k) && typeof v === "boolean") {
      filtered[k] = v;
    } else {
      ignored.push(k);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { hiddenFeatures: JSON.stringify(filtered) },
  });

  return NextResponse.json({ preferences: filtered, ignored });
}
