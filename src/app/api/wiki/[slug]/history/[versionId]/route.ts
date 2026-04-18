import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { findArticleBySlug, getTeamIdFromRequest } from "@/lib/services/wiki-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; versionId: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamId = getTeamIdFromRequest(req);
  const article = await findArticleBySlug(params.slug, userId, teamId);

  if (!article) return notFound("Article not found");

  const version = await prisma.wikiArticleVersion.findFirst({
    where: { id: params.versionId, articleId: article.id },
  });

  if (!version) return notFound("Version not found");

  return NextResponse.json(version);
}
