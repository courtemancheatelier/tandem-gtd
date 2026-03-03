import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const code = typeof body.code === "string" ? body.code.toUpperCase().trim() : "";

  if (!code) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  const cookieStore = cookies();
  cookieStore.set("tandem-invite-code", code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60, // 10 minutes
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
