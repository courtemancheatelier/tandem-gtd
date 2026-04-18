import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";

/**
 * GET /api/users/search?q=<query>
 * Team-scoped user typeahead — only returns users who share at least one team
 * with the authenticated user. Used for delegation picker.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 1) {
    return badRequest("Search query (q) is required");
  }

  // Get team IDs the current user belongs to
  const teamIds = await getUserTeamIds(userId);
  if (teamIds.length === 0) {
    return NextResponse.json([]);
  }

  // Find users who share at least one team, matching name or email
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      isDisabled: false,
      teamMemberships: {
        some: {
          teamId: { in: teamIds },
        },
      },
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    take: 10,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
