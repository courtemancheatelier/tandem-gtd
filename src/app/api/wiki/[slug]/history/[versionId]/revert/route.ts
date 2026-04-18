import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { findArticleBySlug, getTeamIdFromRequest } from "@/lib/services/wiki-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; versionId: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamId = getTeamIdFromRequest(req);
  const article = await findArticleBySlug(params.slug, userId, teamId);

  if (!article) return notFound("Article not found");

  const targetVersion = await prisma.wikiArticleVersion.findFirst({
    where: { id: params.versionId, articleId: article.id },
  });

  if (!targetVersion) return notFound("Version not found");

  // Get the latest version number
  const latestVersion = await prisma.wikiArticleVersion.findFirst({
    where: { articleId: article.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Update article to the target version, then snapshot the reverted state
  await prisma.wikiArticle.update({
    where: { id: article.id },
    data: {
      title: targetVersion.title,
      content: targetVersion.content,
      tags: targetVersion.tags,
      slug: params.slug, // keep current slug
    },
  });

  const updated = await prisma.wikiArticle.findUnique({
    where: { id: article.id },
  });

  // Record the revert as a new version attributed to the user who reverted
  await prisma.wikiArticleVersion.create({
    data: {
      articleId: article.id,
      version: nextVersion,
      title: updated!.title,
      content: updated!.content,
      tags: updated!.tags,
      message: `Reverted to v${targetVersion.version}`,
      actorId: userId,
    },
  });

  return NextResponse.json(updated);
}
