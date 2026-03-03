import { Team, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diff, createdDiff } from "@/lib/history/diff";
import { writeTeamEvent } from "@/lib/history/event-writer";
import { CreateTeamInput, UpdateTeamInput, AddTeamMemberInput, UpdateTeamMemberInput } from "@/lib/validations/team";
import { requireTeamAdmin, isTeamAdmin, isTeamMember } from "./team-permissions";
import type { ActorContext } from "./task-service";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Create a team. The creator is automatically added as ADMIN.
 */
export async function createTeam(
  userId: string,
  data: CreateTeamInput,
  actor: ActorContext
): Promise<Team> {
  return prisma.$transaction(async (tx: TxClient) => {
    const team = await tx.team.create({
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        createdById: userId,
      },
    });

    // Add creator as ADMIN member
    await tx.teamMember.create({
      data: {
        teamId: team.id,
        userId,
        role: "ADMIN",
      },
    });

    const changes = createdDiff(team as unknown as Record<string, unknown>);
    await writeTeamEvent(tx, team.id, "CREATED", changes, actor);

    return team;
  });
}

/**
 * Update a team (admin only).
 */
export async function updateTeam(
  teamId: string,
  userId: string,
  updates: Partial<UpdateTeamInput>,
  actor: ActorContext
): Promise<Team> {
  await requireTeamAdmin(userId, teamId);

  const existing = await prisma.team.findUnique({ where: { id: teamId } });
  if (!existing) throw new Error("Team not found");

  return prisma.$transaction(async (tx: TxClient) => {
    const updated = await tx.team.update({
      where: { id: teamId },
      data: updates,
    });

    const changes = diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await writeTeamEvent(tx, teamId, "UPDATED", changes, actor);
    }

    return updated;
  });
}

/**
 * Delete a team (admin only). Unlinks projects (sets teamId=null).
 */
export async function deleteTeam(
  teamId: string,
  userId: string,
  actor: ActorContext
): Promise<void> {
  await requireTeamAdmin(userId, teamId);

  const existing = await prisma.team.findUnique({ where: { id: teamId } });
  if (!existing) throw new Error("Team not found");

  await prisma.$transaction(async (tx: TxClient) => {
    // Unlink all projects — they become personal again
    await tx.project.updateMany({
      where: { teamId },
      data: { teamId: null },
    });

    const changes = { status: { old: "ACTIVE", new: "DELETED" } };
    await writeTeamEvent(tx, teamId, "DELETED", changes, actor);

    await tx.team.delete({ where: { id: teamId } });
  });
}

/**
 * Add a member to a team (admin only). Resolves by email if userId not provided.
 */
export async function addTeamMember(
  teamId: string,
  adminUserId: string,
  data: AddTeamMemberInput,
  actor: ActorContext
) {
  await requireTeamAdmin(adminUserId, teamId);

  let targetUserId = data.userId;

  // Resolve by email if needed
  if (!targetUserId && data.email) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (!user) throw new Error("No account found for that email. They may need to create an account first.");
    targetUserId = user.id;
  }

  if (!targetUserId) throw new Error("Either userId or email must be provided");

  // Check if already a member
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  if (existing) throw new Error("User is already a team member");

  return prisma.$transaction(async (tx: TxClient) => {
    const member = await tx.teamMember.create({
      data: {
        teamId,
        userId: targetUserId!,
        role: data.role ?? "MEMBER",
        label: data.label,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const changes = {
      userId: { old: null, new: targetUserId },
      role: { old: null, new: data.role ?? "MEMBER" },
    };
    await writeTeamEvent(tx, teamId, "MEMBER_ADDED", changes, actor);

    return member;
  });
}

/**
 * Update a team member's role or label (admin only).
 */
export async function updateTeamMember(
  teamId: string,
  adminUserId: string,
  targetUserId: string,
  updates: UpdateTeamMemberInput,
  actor: ActorContext
) {
  await requireTeamAdmin(adminUserId, teamId);

  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
  });
  if (!existing) throw new Error("Team member not found");

  return prisma.$transaction(async (tx: TxClient) => {
    const updated = await tx.teamMember.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: updates,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const changes = diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await writeTeamEvent(tx, teamId, "MEMBER_ROLE_CHANGED", changes, actor);
    }

    return updated;
  });
}

/**
 * Remove a team member. Admin can remove anyone; members can self-leave.
 * Cannot remove the last admin.
 */
export async function removeTeamMember(
  teamId: string,
  requestingUserId: string,
  targetUserId: string,
  actor: ActorContext
): Promise<void> {
  const isSelfLeave = requestingUserId === targetUserId;

  if (!isSelfLeave) {
    await requireTeamAdmin(requestingUserId, teamId);
  } else {
    // Self-leave: just verify membership
    const isMember = await isTeamMember(targetUserId, teamId);
    if (!isMember) throw new Error("Not a team member");
  }

  // Prevent removing the last admin
  const targetIsAdmin = await isTeamAdmin(targetUserId, teamId);
  if (targetIsAdmin) {
    const adminCount = await prisma.teamMember.count({
      where: { teamId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw new Error("Cannot remove the last team admin");
    }
  }

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.teamMember.delete({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });

    const changes = {
      userId: { old: targetUserId, new: null },
    };
    await writeTeamEvent(tx, teamId, "MEMBER_REMOVED", changes, actor);
  });
}

/**
 * List all teams a user belongs to, with member count and the user's role.
 */
export async function getUserTeams(userId: string) {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          _count: {
            select: { members: true, projects: true },
          },
        },
      },
    },
  });

  return memberships.map((m) => ({
    id: m.team.id,
    name: m.team.name,
    description: m.team.description,
    icon: m.team.icon,
    role: m.role,
    memberCount: m.team._count.members,
    projectCount: m.team._count.projects,
    joinedAt: m.joinedAt,
    createdAt: m.team.createdAt,
  }));
}
