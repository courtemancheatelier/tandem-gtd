import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";

const BCRYPT_ROUNDS = 10;
const TOKEN_PREFIX_TAG = "tnm_";
const RAW_HEX_CHARS = 40;
const DB_PREFIX_LENGTH = 8;

const VALID_SCOPES = ["read", "write"] as const;

const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

/**
 * Check that apiAccessEnabled is on. Returns a 403 response if not.
 */
async function requireApiAccess(): Promise<NextResponse | null> {
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
  return null;
}

/**
 * GET /api/settings/api-tokens
 * List the current user's API tokens (never exposes hashes).
 *
 * Auth: session + Bearer (read scope)
 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const gate = await requireApiAccess();
  if (gate) return gate;

  const tokens = await prisma.apiToken.findMany({
    where: { userId, revokedAt: null },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      expiresAt: true,
      lastUsed: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tokens);
}

/**
 * POST /api/settings/api-tokens
 * Create a new API token. Returns the plaintext token exactly once.
 *
 * Auth: session-only — creating tokens via Bearer would allow privilege
 * escalation (a token minting new tokens with broader scopes).
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const gate = await requireApiAccess();
  if (gate) return gate;

  const body = await req.json();
  const parsed = createTokenSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { name, scopes, expiresInDays } = parsed.data;

  // Generate token: tnm_ + 40 hex chars
  const rawHex = crypto.randomBytes(Math.ceil(RAW_HEX_CHARS / 2)).toString("hex").slice(0, RAW_HEX_CHARS);
  const plaintext = TOKEN_PREFIX_TAG + rawHex;
  const prefix = plaintext.slice(0, DB_PREFIX_LENGTH);
  const hash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const token = await prisma.apiToken.create({
    data: {
      name,
      token: hash,
      prefix,
      scopes,
      expiresAt,
      userId,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    { ...token, plaintext },
    { status: 201 }
  );
}
