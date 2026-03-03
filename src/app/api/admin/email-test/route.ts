import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { prisma } from "@/lib/prisma";
import { sendEmail, isSmtpConfigured } from "@/lib/email";
import { checkRateLimit } from "@/lib/api/rate-limit";

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Rate limit: 3 test emails per minute per admin
  const rl = checkRateLimit(`email-test:${auth.userId}`, 3, 60_000);
  if (rl) return rl;

  const configured = await isSmtpConfigured();
  if (!configured) {
    return NextResponse.json(
      { error: "SMTP is not configured. Set SMTP settings in the admin panel or via environment variables." },
      { status: 400 }
    );
  }

  const admin = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });
  if (!admin) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await sendEmail({
      to: admin.email,
      subject: "Tandem SMTP Test",
      text: "This is a test email from your Tandem instance. If you received this, your SMTP configuration is working correctly.",
    });

    return NextResponse.json({ message: `Test email sent to ${admin.email}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to send test email: ${message}` },
      { status: 500 }
    );
  }
}
