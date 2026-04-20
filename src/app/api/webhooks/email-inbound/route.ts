import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/api/rate-limit";
import { writeInboxEvent } from "@/lib/history/event-writer";
import { createdDiff } from "@/lib/history/diff";
import { emailInboundSchema } from "@/lib/validations/email-capture";

const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET;

function verifySecret(provided: string | null): boolean {
  if (!WEBHOOK_SECRET || !provided) return false;
  if (provided.length !== WEBHOOK_SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(WEBHOOK_SECRET));
}

export async function POST(req: NextRequest) {
  // 1. Verify webhook secret (constant-time comparison)
  const secret = req.headers.get("x-webhook-secret");
  if (!verifySecret(secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse and validate body
  let raw;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = emailInboundSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { token, subject, body, from } = parsed.data;

  // 3. Rate limit by source IP before token lookup (prevents token oracle)
  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = rateLimit(`email-inbound:${sourceIp}`, 30, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ ok: true }); // Always 200 to prevent info leaks
  }

  // 4. Look up user by token (don't reveal whether token exists)
  const user = await prisma.user.findFirst({
    where: { emailInboxToken: token, emailInboxEnabled: true, isDisabled: false },
  });
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  // 5. Build inbox item content
  const content = (subject || "(No subject)").slice(0, 500);
  const noteParts = [
    from ? `From: ${from}` : null,
    body ? `\n---\n${body}` : null,
  ].filter(Boolean);
  const notes = noteParts.length > 0 ? noteParts.join("\n").slice(0, 5000) : undefined;

  // 6. Create InboxItem with event history in a transaction
  await prisma.$transaction(async (tx) => {
    const item = await tx.inboxItem.create({
      data: {
        content,
        notes,
        source: "email",
        sourceEmail: from || null,
        userId: user.id,
        aiVisibility: "VISIBLE",
      },
    });

    const changes = createdDiff(item as unknown as Record<string, unknown>);
    await writeInboxEvent(tx, item.id, "CAPTURED", changes, {
      actorType: "SYSTEM",
      source: "API",
      message: `Email capture from ${from || "unknown sender"}`,
    });
  });

  return NextResponse.json({ ok: true });
}
