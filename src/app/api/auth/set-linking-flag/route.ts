import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api/auth-helpers";
import { cookies } from "next/headers";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = cookies();
  cookieStore.set("tandem-link-account", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 5 * 60, // 5 minutes
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
