import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/services/team-permissions";

/**
 * Find a wiki article by slug, handling both personal and team scopes.
 * For team articles, verifies membership before returning.
 * Returns null if not found or unauthorized.
 */
export async function findArticleBySlug(
  slug: string,
  userId: string,
  teamId?: string | null
) {
  const select = {
    id: true,
    slug: true,
    title: true,
    content: true,
    tags: true,
    version: true,
    teamId: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  if (teamId) {
    // Team-scoped article
    const isMember = await isTeamMember(userId, teamId);
    if (!isMember) return null;

    return prisma.wikiArticle.findFirst({
      where: { teamId, slug },
      select,
    });
  }

  // Personal article
  return prisma.wikiArticle.findUnique({
    where: { userId_slug: { userId, slug } },
    select,
  });
}

/**
 * Extract teamId from request query params.
 */
export function getTeamIdFromRequest(req: Request): string | null {
  const { searchParams } = new URL(req.url);
  return searchParams.get("teamId") || null;
}
