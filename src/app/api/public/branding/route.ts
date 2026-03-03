import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BRANDING_DEFAULTS, BRANDING_SELECT } from "@/lib/branding";

export async function GET() {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: BRANDING_SELECT,
  });

  if (!settings) {
    return NextResponse.json(BRANDING_DEFAULTS);
  }

  return NextResponse.json(settings);
}
