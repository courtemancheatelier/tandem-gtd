import { prisma } from "@/lib/prisma";

interface DeleteResult {
  success: boolean;
  error?: string;
}

export async function deleteUserAccount(
  targetUserId: string
): Promise<DeleteResult> {
  // Verify user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isAdmin: true },
  });

  if (!targetUser) {
    return { success: false, error: "User not found" };
  }

  // Last-admin guard: if target is an admin, ensure they're not the only one
  if (targetUser.isAdmin) {
    const adminCount = await prisma.user.count({
      where: { isAdmin: true },
    });
    if (adminCount <= 1) {
      return {
        success: false,
        error: "Cannot delete the last admin account",
      };
    }
  }

  // Cascades handle all related records
  await prisma.user.delete({ where: { id: targetUserId } });

  return { success: true };
}
