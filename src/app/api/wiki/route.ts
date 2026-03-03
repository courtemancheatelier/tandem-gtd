import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, badRequest } from "@/lib/api/auth-helpers";
import { createWikiArticleSchema } from "@/lib/validations/wiki";
import { getUserTeamIds, isTeamMember } from "@/lib/services/team-permissions";
import { syncBacklinks } from "@/lib/services/wiki-backlinks";

// FTS search result row shape from $queryRaw
interface FtsRow {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  team_id: string | null;
  createdAt: Date;
  updatedAt: Date;
  snippet: string;
  team_name: string | null;
  team_icon: string | null;
  user_id: string;
  user_name: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const tag = searchParams.get("tag");
  const teamId = searchParams.get("teamId");
  const scope = searchParams.get("scope");
  const includePersonal = searchParams.get("includePersonal") === "true";
  const before = searchParams.get("before");
  const limitParam = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100);

  // --- FTS search path (when search query is present) ---
  if (search) {
    // Build ownership SQL clause
    let ownershipSql: Prisma.Sql;
    if (teamId) {
      const member = await isTeamMember(userId, teamId);
      if (!member) return unauthorized();
      if (includePersonal) {
        ownershipSql = Prisma.sql`(w.team_id = ${teamId} OR (w."userId" = ${userId} AND w.team_id IS NULL))`;
      } else {
        ownershipSql = Prisma.sql`w.team_id = ${teamId}`;
      }
    } else if (scope === "all") {
      const teamIds = await getUserTeamIds(userId);
      if (teamIds.length > 0) {
        ownershipSql = Prisma.sql`(w."userId" = ${userId} AND w.team_id IS NULL OR w.team_id = ANY(${teamIds}::text[]))`;
      } else {
        ownershipSql = Prisma.sql`(w."userId" = ${userId} AND w.team_id IS NULL)`;
      }
    } else {
      ownershipSql = Prisma.sql`(w."userId" = ${userId} AND w.team_id IS NULL)`;
    }

    // Build optional tag filter
    const tagSql = tag
      ? Prisma.sql`AND ${tag} = ANY(w.tags)`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<FtsRow[]>`
      SELECT
        w.id,
        w.slug,
        w.title,
        w.tags,
        w.team_id,
        w."createdAt",
        w."updatedAt",
        ts_headline('english', w.content, plainto_tsquery('english', ${search}),
          'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>') AS snippet,
        t.name AS team_name,
        t.icon AS team_icon,
        w."userId" AS user_id,
        u.name AS user_name
      FROM "WikiArticle" w
      LEFT JOIN "Team" t ON t.id = w.team_id
      LEFT JOIN "User" u ON u.id = w."userId"
      WHERE ${ownershipSql}
        AND w.search_vector @@ plainto_tsquery('english', ${search})
        ${tagSql}
      ORDER BY ts_rank(w.search_vector, plainto_tsquery('english', ${search})) DESC
      LIMIT ${limitParam}
    `;

    const results = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      tags: r.tags,
      teamId: r.team_id,
      team: r.team_name ? { id: r.team_id!, name: r.team_name, icon: r.team_icon } : null,
      user: { id: r.user_id, name: r.user_name },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      snippet: r.snippet,
    }));

    // No cursor pagination for search results (ranked by relevance, not time)
    return NextResponse.json({ articles: results, hasMore: false, nextCursor: null });
  }

  // --- Non-search listing path (cursor pagination) ---

  // Build ownership filter
  let ownershipFilter: Record<string, unknown>;

  if (teamId) {
    const member = await isTeamMember(userId, teamId);
    if (!member) return unauthorized();
    if (includePersonal) {
      ownershipFilter = { OR: [{ teamId }, { userId, teamId: null }] };
    } else {
      ownershipFilter = { teamId };
    }
  } else if (scope === "all") {
    const teamIds = await getUserTeamIds(userId);
    ownershipFilter = {
      OR: [
        { userId, teamId: null },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    };
  } else {
    ownershipFilter = { userId, teamId: null };
  }

  // Build final where clause
  const conditions: Record<string, unknown>[] = [ownershipFilter];

  if (tag) {
    conditions.push({ tags: { has: tag } });
  }

  // Cursor pagination: fetch articles before the given timestamp
  if (before) {
    conditions.push({ updatedAt: { lt: new Date(before) } });
  }

  const where = conditions.length === 1 ? conditions[0] : { AND: conditions };

  // Fetch limit + 1 to detect hasMore
  const articles = await prisma.wikiArticle.findMany({
    where,
    take: limitParam + 1,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      tags: true,
      teamId: true,
      createdAt: true,
      updatedAt: true,
      team: { select: { id: true, name: true, icon: true } },
      user: { select: { id: true, name: true } },
    },
  });

  const hasMore = articles.length > limitParam;
  const page = hasMore ? articles.slice(0, limitParam) : articles;
  const nextCursor = hasMore ? page[page.length - 1].updatedAt.toISOString() : null;

  const results = page.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    tags: article.tags,
    teamId: article.teamId,
    team: article.team,
    user: article.user,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    snippet: undefined as string | undefined,
  }));

  return NextResponse.json({ articles: results, hasMore, nextCursor });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createWikiArticleSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { teamId, ...articleData } = parsed.data;

  // If assigning to a team, verify membership
  if (teamId) {
    const member = await isTeamMember(userId, teamId);
    if (!member) {
      return badRequest("You are not a member of this team");
    }

    // Check slug uniqueness within team
    const existing = await prisma.wikiArticle.findFirst({
      where: { teamId, slug: articleData.slug },
    });
    if (existing) {
      return badRequest("An article with this slug already exists in this team. Choose a different title.");
    }
  } else {
    // Check slug uniqueness for personal articles
    const existing = await prisma.wikiArticle.findUnique({
      where: { userId_slug: { userId, slug: articleData.slug } },
    });
    if (existing) {
      return badRequest("An article with this slug already exists. Choose a different title.");
    }
  }

  const article = await prisma.wikiArticle.create({
    data: {
      ...articleData,
      userId,
      teamId: teamId || null,
    },
  });

  // Create initial version snapshot so the creator is tracked in history
  await prisma.wikiArticleVersion.create({
    data: {
      articleId: article.id,
      version: 1,
      title: article.title,
      content: article.content,
      tags: article.tags,
      message: "Initial version",
      actorId: userId,
    },
  });

  // Sync backlinks from wikilink references in content
  await syncBacklinks(article.id, article.content, userId, teamId || null);

  return NextResponse.json(article, { status: 201 });
}
