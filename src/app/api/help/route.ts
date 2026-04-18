import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Check if user is admin for adminOnly filtering
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {
    isPublished: true,
    ...(user?.isAdmin ? {} : { adminOnly: false }),
  };

  if (category) {
    where.category = category;
  }

  if (tag) {
    where.tags = { has: tag };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  const articles = await prisma.helpArticle.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      tags: true,
      sortOrder: true,
      adminOnly: true,
      content: true,
      updatedAt: true,
    },
  });

  // Build results with optional search snippets
  const results = articles.map((article) => {
    let snippet: string | undefined;

    if (search && article.content.toLowerCase().includes(search.toLowerCase())) {
      const lowerContent = article.content.toLowerCase();
      const lowerSearch = search.toLowerCase();
      const idx = lowerContent.indexOf(lowerSearch);
      const start = Math.max(0, idx - 60);
      const end = Math.min(article.content.length, idx + search.length + 60);
      snippet =
        (start > 0 ? "..." : "") +
        article.content.slice(start, end).replace(/\n/g, " ") +
        (end < article.content.length ? "..." : "");
    }

    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      category: article.category,
      tags: article.tags,
      sortOrder: article.sortOrder,
      adminOnly: article.adminOnly,
      updatedAt: article.updatedAt,
      snippet,
    };
  });

  // Derive categories with counts from the filtered articles
  const categoryMap = new Map<string, number>();
  for (const article of results) {
    categoryMap.set(article.category, (categoryMap.get(article.category) || 0) + 1);
  }
  const categoryOrder: Record<string, number> = {
    "Getting Started": 0,
    "About": 1,
    "Features": 2,
    "GTD Guide": 3,
    "Admin": 4,
  };
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (categoryOrder[a.name] ?? 99) - (categoryOrder[b.name] ?? 99));

  return NextResponse.json({ articles: results, categories });
}
