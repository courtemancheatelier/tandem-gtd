import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const article = await prisma.helpArticle.findUnique({
    where: { slug: params.slug },
  });

  if (!article || !article.isPublished) {
    return notFound("Article not found");
  }

  // Hide adminOnly articles from non-admins
  if (article.adminOnly) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return notFound("Article not found");
    }
  }

  return NextResponse.json(article);
}
