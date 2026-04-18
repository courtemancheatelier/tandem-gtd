import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { z } from "zod";

const createDomainSchema = z.object({
  domain: z.string().min(1).max(255),
  tier: z.enum(["WAITLIST", "ALPHA", "BETA", "GENERAL"]).default("BETA"),
  note: z.string().max(500).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const domains = await prisma.allowedDomain.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(domains);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = createDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const domain = parsed.data.domain.toLowerCase().trim();

  const existing = await prisma.allowedDomain.findUnique({
    where: { domain },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Domain already exists" },
      { status: 409 }
    );
  }

  const created = await prisma.allowedDomain.create({
    data: {
      domain,
      tier: parsed.data.tier,
      note: parsed.data.note,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
