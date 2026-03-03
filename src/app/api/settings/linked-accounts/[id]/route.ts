import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/api/auth-helpers";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = params.id;

  // Verify the account belongs to this user
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Check how many OAuth accounts + password the user has
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      _count: { select: { accounts: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get server auth mode
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { authMode: true },
  });

  const isOAuthOnly = settings?.authMode === "OAUTH_ONLY";
  const isLastAccount = user._count.accounts <= 1;

  // In OAUTH_ONLY mode: block if last OAuth account (no fallback)
  if (isOAuthOnly && isLastAccount) {
    return NextResponse.json(
      { error: "Cannot remove your only OAuth account in OAuth-only mode" },
      { status: 400 }
    );
  }

  // In OAUTH_AND_CREDENTIALS mode: block if last account AND no password
  if (!isOAuthOnly && isLastAccount && !user.password) {
    return NextResponse.json(
      { error: "Cannot remove your only OAuth account when you have no password set" },
      { status: 400 }
    );
  }

  await prisma.account.delete({
    where: { id: accountId },
  });

  return NextResponse.json({ success: true });
}
