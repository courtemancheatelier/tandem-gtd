import { prisma } from "@/lib/prisma";

/**
 * Check if a user is a member of a team.
 */
export async function isTeamMember(
  userId: string,
  teamId: string
): Promise<boolean> {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  return !!member;
}

/**
 * Check if a user is an admin of a team.
 */
export async function isTeamAdmin(
  userId: string,
  teamId: string
): Promise<boolean> {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  return member?.role === "ADMIN";
}

/**
 * Get all team IDs a user belongs to.
 */
export async function getUserTeamIds(userId: string): Promise<string[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

/**
 * Throw if the user is not a team admin.
 * Used by the service layer to guard admin-only operations.
 */
export async function requireTeamAdmin(
  userId: string,
  teamId: string
): Promise<void> {
  const admin = await isTeamAdmin(userId, teamId);
  if (!admin) {
    throw new Error("Only team admins can perform this action");
  }
}
