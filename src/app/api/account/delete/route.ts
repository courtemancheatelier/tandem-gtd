import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { deleteUserAccount } from "@/lib/services/account-deletion-service";

/**
 * Auth: session-only — account deletion is irreversible; a compromised
 * Bearer token must not be able to delete the entire account.
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const { confirmEmail } = body;

  if (!confirmEmail || typeof confirmEmail !== "string") {
    return badRequest("Email confirmation is required");
  }

  // Verify the email matches the authenticated user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.email.toLowerCase() !== confirmEmail.toLowerCase()) {
    return badRequest("Email does not match your account");
  }

  const result = await deleteUserAccount(userId);

  if (!result.success) {
    return badRequest(result.error!);
  }

  return NextResponse.json({ success: true });
}
