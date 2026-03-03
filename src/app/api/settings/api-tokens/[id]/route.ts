import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, unauthorized, notFound } from "@/lib/api/auth-helpers";

/**
 * DELETE /api/settings/api-tokens/[id]
 * Soft-revoke an API token (sets revokedAt). Verifies ownership.
 *
 * Auth: session-only — a Bearer token revoking other tokens is a DoS vector;
 * a compromised token could revoke all tokens and lock out the user.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const { id } = await params;

  // Check apiAccessEnabled
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { apiAccessEnabled: true },
  });
  if (!settings?.apiAccessEnabled) {
    return NextResponse.json(
      { error: "API access is not enabled" },
      { status: 403 }
    );
  }

  // Find token and verify ownership
  const token = await prisma.apiToken.findUnique({
    where: { id },
    select: { userId: true, revokedAt: true },
  });

  if (!token || token.userId !== userId) {
    return notFound("Token not found");
  }

  if (token.revokedAt) {
    return NextResponse.json(
      { error: "Token already revoked" },
      { status: 400 }
    );
  }

  await prisma.apiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
