import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { deleteUserAccount } from "@/lib/services/account-deletion-service";
import bcrypt from "bcryptjs";

function mapUserResponse(user: {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isDisabled: boolean;
  tier: string;
  aiEnabled: boolean;
  aiDailyLimit: number | null;
  aiMessagesUsedToday: number;
  createdAt: Date;
  password: string | null;
  accounts: { provider: string }[];
  invitedBy: { id: string; name: string } | null;
  _count: { accounts: number; invitees: number; inviteCodesCreated: number };
}) {
  const { password, accounts, invitedBy, _count, ...rest } = user;
  return {
    ...rest,
    hasPassword: !!password,
    hasOAuthAccounts: _count.accounts > 0,
    oauthProviders: Array.from(new Set(accounts.map((a) => a.provider))),
    invitedByName: invitedBy?.name ?? null,
    inviteesCount: _count.invitees,
    inviteCodesCount: _count.inviteCodesCreated,
  };
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  isAdmin: true,
  isDisabled: true,
  tier: true,
  invitedBy: { select: { id: true, name: true } },
  aiEnabled: true,
  aiDailyLimit: true,
  aiMessagesUsedToday: true,
  createdAt: true,
  password: true,
  accounts: { select: { provider: true } },
  _count: { select: { accounts: true, invitees: true, inviteCodesCreated: true } },
} as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const targetUserId = params.id;
  const body = await req.json();

  // Safety check: admin cannot modify their own isAdmin or isDisabled status
  if ("isAdmin" in body && targetUserId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot modify your own admin status" },
      { status: 400 }
    );
  }
  if ("isDisabled" in body && targetUserId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot disable your own account" },
      { status: 400 }
    );
  }

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only allow updating specific fields
  const allowedFields = ["isAdmin", "isDisabled", "aiEnabled", "aiDailyLimit", "tier"];
  const data: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      if (field === "aiDailyLimit") {
        // Allow null to reset to server default, or a positive number
        if (body[field] === null) {
          data[field] = null;
        } else {
          const limit = Number(body[field]);
          if (!isNaN(limit) && limit > 0) {
            data[field] = limit;
          }
        }
      } else {
        data[field] = body[field];
      }
    }
  }

  // Block password operations in OAUTH_ONLY mode
  if (body.password || body.removePassword) {
    const serverSettings = await prisma.serverSettings.findUnique({
      where: { id: "singleton" },
      select: { authMode: true },
    });
    if (serverSettings?.authMode === "OAUTH_ONLY") {
      return NextResponse.json(
        { error: "Password operations are disabled in OAuth-only mode" },
        { status: 400 }
      );
    }
  }

  // Handle password reset
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }
    data.password = bcrypt.hashSync(body.password, 10);
  }

  // Handle remove password (force OAuth-only)
  if (body.removePassword === true) {
    const accountCount = await prisma.account.count({
      where: { userId: targetUserId },
    });
    if (accountCount === 0) {
      return NextResponse.json(
        { error: "User has no linked OAuth account" },
        { status: 400 }
      );
    }
    data.password = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    select: userSelect,
    data,
  });

  return NextResponse.json(mapUserResponse(updatedUser));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const targetUserId = params.id;

  if (targetUserId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  try {
    const result = await deleteUserAccount(targetUserId);

    if (!result.success) {
      const status = result.error === "User not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete user:", err);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
