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
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);

  // Query backlinks from the join table
  const backlinks = await prisma.wikiBacklink.findMany({
    where: { targetArticleId: article.id },
    take: limit,
    select: {
      sourceArticle: {
        select: { id: true, slug: true, title: true, updatedAt: true },
      },
    },
    orderBy: { sourceArticle: { updatedAt: "desc" } },
  });

  return NextResponse.json(backlinks.map((bl) => bl.sourceArticle));
}
