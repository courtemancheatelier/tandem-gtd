import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { findArticleBySlug, getTeamIdFromRequest } from "@/lib/services/wiki-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamId = getTeamIdFromRequest(req);
  const article = await findArticleBySlug(params.slug, userId, teamId);

  if (!article) return notFound("Article not found");

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  const [versions, total] = await Promise.all([
    prisma.wikiArticleVersion.findMany({
      where: { articleId: article.id },
      select: {
        id: true,
        version: true,
        title: true,
        message: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
      orderBy: { version: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.wikiArticleVersion.count({
      where: { articleId: article.id },
    }),
  ]);

  return NextResponse.json({
    versions,
    total,
    hasMore: offset + versions.length < total,
  });
}
