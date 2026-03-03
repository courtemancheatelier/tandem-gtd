import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

/**
 * Extract [[wikilink]] targets from content and return deduplicated slugs.
 */
export function extractWikilinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const slugs = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    slugs.add(slugify(match[1]));
  }
  return Array.from(slugs);
}

/**
 * Sync the WikiBacklink rows for a given article.
 * Resolves extracted wikilink slugs to article IDs within the same scope
 * (personal or team), then replaces all outgoing backlinks in a transaction.
 */
export async function syncBacklinks(
  articleId: string,
  content: string,
  userId: string,
  teamId: string | null,
  prismaClient?: PrismaClient
) {
  const db = prismaClient ?? defaultPrisma;
  const slugs = extractWikilinks(content);

  if (slugs.length === 0) {
    // No links — just delete any existing outgoing backlinks
    await db.wikiBacklink.deleteMany({ where: { sourceArticleId: articleId } });
    return;
  }

  // Resolve slugs to article IDs within the same scope
  const scopeWhere = teamId
    ? { teamId, slug: { in: slugs }, id: { not: articleId } }
    : { userId, teamId: null, slug: { in: slugs }, id: { not: articleId } };

  const targets = await db.wikiArticle.findMany({
    where: scopeWhere,
    select: { id: true },
  });

  const targetIds = targets.map((t) => t.id);

  // Replace all outgoing backlinks in a transaction
  await db.$transaction([
    db.wikiBacklink.deleteMany({ where: { sourceArticleId: articleId } }),
    ...(targetIds.length > 0
      ? [
          db.wikiBacklink.createMany({
            data: targetIds.map((targetId) => ({
              sourceArticleId: articleId,
              targetArticleId: targetId,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
