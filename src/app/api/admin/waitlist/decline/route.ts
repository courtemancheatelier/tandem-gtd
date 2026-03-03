import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { z } from "zod";

const declineSchema = z.object({
  waitlistEntryId: z.string().cuid(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = declineSchema.safeParse(body);
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

  const updated = await prisma.waitlistEntry.update({
    where: { id: waitlistEntryId },
    data: { status: "DECLINED" },
  });

  return NextResponse.json(updated);
}
