import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100).optional(),
  isAdmin: z.boolean().default(false),
});

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
  lastLoginAt: true,
  loginCount: true,
  password: true,
  accounts: { select: { provider: true } },
  _count: { select: { accounts: true, invitees: true, inviteCodesCreated: true } },
} as const;

function mapUserResponse(user: {
  password: string | null;
  accounts: { provider: string }[];
  invitedBy: { id: string; name: string } | null;
  _count: { accounts: number; invitees: number; inviteCodesCreated: number };
  [key: string]: unknown;
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

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users.map(mapUserResponse));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check if email already exists
  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A user with that email already exists" },
      { status: 400 }
    );
  }

  const hashedPassword = parsed.data.password
    ? bcrypt.hashSync(parsed.data.password, 10)
    : null;

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashedPassword,
      isAdmin: parsed.data.isAdmin,
    },
    select: userSelect,
  });

  return NextResponse.json(mapUserResponse(user), { status: 201 });
}
