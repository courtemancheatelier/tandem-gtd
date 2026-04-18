import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

function generateToken(): string {
  return crypto.randomBytes(16).toString("base64url"); // 128-bit entropy, URL-safe
}

function formatAddress(token: string | null | undefined): string | null {
  const domain = process.env.EMAIL_INBOX_DOMAIN || "";
  if (!token || !domain) return null;
  const prefix = process.env.EMAIL_INBOX_LOCAL_PREFIX || "";
  return `${prefix}${token}@${domain}`;
}

// GET — fetch current email capture status
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { emailInboxToken: true, emailInboxEnabled: true },
  });

  const domain = process.env.EMAIL_INBOX_DOMAIN || "";

  return NextResponse.json({
    enabled: user?.emailInboxEnabled ?? false,
    address: formatAddress(user?.emailInboxToken),
    domain,
    configured: !!domain,
  });
}

// POST — enable, disable, or regenerate
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body?.action;
  if (!["enable", "disable", "regenerate"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const domain = process.env.EMAIL_INBOX_DOMAIN || "";

  if (action === "enable") {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { emailInboxToken: true },
    });

    const token = user?.emailInboxToken || generateToken();
    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: { emailInboxEnabled: true, emailInboxToken: token },
      select: { emailInboxToken: true, emailInboxEnabled: true },
    });

    return NextResponse.json({
      enabled: true,
      address: formatAddress(updated.emailInboxToken),
      domain,
      configured: !!domain,
    });
  }

  if (action === "disable") {
    await prisma.user.update({
      where: { id: auth.userId },
      data: { emailInboxEnabled: false },
    });
    return NextResponse.json({ enabled: false, address: null, domain, configured: !!domain });
  }

  if (action === "regenerate") {
    const newToken = generateToken();
    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: { emailInboxToken: newToken, emailInboxEnabled: true },
      select: { emailInboxToken: true, emailInboxEnabled: true },
    });

    return NextResponse.json({
      enabled: true,
      address: formatAddress(updated.emailInboxToken),
      domain,
      configured: !!domain,
    });
  }
}
