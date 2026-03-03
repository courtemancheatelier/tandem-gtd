import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

/**
 * GET /api/settings/features
 * Returns feature flags for the current authenticated user.
 * Not admin-only — any logged-in user can read feature flags.
 *
 * Auth: session + Bearer (read scope)
 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { apiAccessEnabled: true },
  });

  return NextResponse.json({
    apiAccessEnabled: settings?.apiAccessEnabled ?? false,
  });
}
