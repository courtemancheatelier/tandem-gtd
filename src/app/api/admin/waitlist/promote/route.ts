import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { z } from "zod";
import crypto from "crypto";
import { sendWelcomeEmail } from "@/lib/email";

const promoteSchema = z.object({
  waitlistEntryId: z.string().cuid(),
});

const defaultContexts = [
  { name: "@Computer", color: "#8B5CF6", sortOrder: 0 },
  { name: "@Phone", color: "#F59E0B", sortOrder: 1 },
  { name: "@Office", color: "#3B82F6", sortOrder: 2 },
  { name: "@Home", color: "#10B981", sortOrder: 3 },
  { name: "@Errands", color: "#EF4444", sortOrder: 4 },
  { name: "@Anywhere", color: "#6B7280", sortOrder: 5 },
  { name: "@Agenda", color: "#EC4899", sortOrder: 6 },
];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { waitlistEntryId } = parsed.data;

  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: waitlistEntryId },
  });

  if (!entry) {
    return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 });
  }

  if (entry.status !== "PENDING") {
    return NextResponse.json({ error: `Entry is already ${entry.status.toLowerCase()}` }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Guards inside the transaction to avoid TOCTOU race
      const existingUser = await tx.user.findUnique({ where: { email: entry.email } });
      if (existingUser) {
        throw new Error("A user with this email already exists");
      }

      const existingAccount = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: entry.provider,
            providerAccountId: entry.providerAccountId,
          },
        },
      });
      if (existingAccount) {
        throw new Error("An account with this provider already exists");
      }

      const newUser = await tx.user.create({
        data: {
          email: entry.email,
          name: entry.name,
          password: null,
          tier: "ALPHA",
        },
      });

      await tx.account.create({
        data: {
          provider: entry.provider,
          providerAccountId: entry.providerAccountId,
          userId: newUser.id,
        },
      });

      await tx.context.createMany({
        data: defaultContexts.map((ctx) => ({ ...ctx, userId: newUser.id })),
      });

      await tx.waitlistEntry.delete({
        where: { id: waitlistEntryId },
      });

      return newUser;
    });

    // Send welcome email (fire-and-forget, never blocks promotion)
    let emailSent = false;
    try {
      // Check if any OAuth providers are configured
      const hasOAuth =
        !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
        !!(process.env.APPLE_ID && process.env.APPLE_SECRET) ||
        !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) ||
        !!(process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET);

      if (hasOAuth) {
        // OAuth path: simple welcome with sign-in link
        emailSent = await sendWelcomeEmail(entry.email, entry.name);
      } else {
        // Non-OAuth path: create password setup token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

        await prisma.passwordSetupToken.upsert({
          where: { userId: result.id },
          update: { token: tokenHash, expiresAt, usedAt: null },
          create: { userId: result.id, token: tokenHash, expiresAt },
        });

        // Send the raw token in the email — only the hash is stored
        emailSent = await sendWelcomeEmail(entry.email, entry.name, rawToken);
      }
    } catch (err) {
      console.error("[promote] Failed to send welcome email:", err);
    }

    return NextResponse.json({ ...result, emailSent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to promote user";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
