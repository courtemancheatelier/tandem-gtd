import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateWikiArticleSchema } from "@/lib/validations/wiki";
import { findArticleBySlug, getTeamIdFromRequest } from "@/lib/services/wiki-helpers";
import { isTeamAdmin, getUserTeamIds } from "@/lib/services/team-permissions";
import { syncBacklinks } from "@/lib/services/wiki-backlinks";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamId = getTeamIdFromRequest(req);
  let article = await findArticleBySlug(params.slug, userId, teamId);

  // If no teamId specified and personal lookup missed, search user's teams
  if (!article && !teamId) {
    const teamIds = await getUserTeamIds(userId);
    if (teamIds.length > 0) {
      article = await prisma.wikiArticle.findFirst({
        where: { slug: params.slug, teamId: { in: teamIds } },
        select: {
          id: true, slug: true, title: true, content: true,
          tags: true, teamId: true, userId: true, version: true,
          createdAt: true, updatedAt: true,
        },
      });
    }
  }

  if (!article) return notFound("Article not found");

  return NextResponse.json(article);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamId = getTeamIdFromRequest(req);
  const existing = await findArticleBySlug(params.slug, userId, teamId);
  if (!existing) return notFound("Article not found");

  const body = await req.json();
  const parsed = updateWikiArticleSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Conflict detection: prefer version-based, fall back to timestamp-based (deprecated)
  if (parsed.data.version) {
    if ((existing as Record<string, unknown>).version !== parsed.data.version) {
      const current = await prisma.wikiArticle.findUnique({ where: { id: existing.id } });
      return NextResponse.json(
        {
          error: "CONFLICT",
          message: "This article was modified since you started editing.",
          currentVersion: current?.version ?? (existing as Record<string, unknown>).version,
          currentState: current,
        },
        { status: 409 }
      );
    }
  } else if (parsed.data.expectedUpdatedAt) {
    // Deprecated: timestamp-based conflict detection
    const expectedDate = new Date(parsed.data.expectedUpdatedAt).getTime();
    const actualDate = new Date(existing.updatedAt).getTime();
    if (expectedDate !== actualDate) {
      return NextResponse.json(
        { error: "CONFLICT", message: "This article was modified since you started editing." },
        { status: 409 }
      );
    }
  }

  // If slug is changing, check for uniqueness in the appropriate scope
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    if (existing.teamId) {
      const conflict = await prisma.wikiArticle.findFirst({
        where: { teamId: existing.teamId, slug: parsed.data.slug },
      });
      if (conflict) {
        return badRequest("An article with this slug already exists in this team.");
      }
    } else {
      const conflict = await prisma.wikiArticle.findUnique({
        where: { userId_slug: { userId, slug: parsed.data.slug } },
      });
      if (conflict) {
        return badRequest("An article with this slug already exists.");
      }
    }
  }

  const latestVersion = await prisma.wikiArticleVersion.findFirst({
    where: { articleId: existing.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Extract message, expectedUpdatedAt, and version from parsed data (don't persist on article)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { message, expectedUpdatedAt: _expectedUpdatedAt, version: _version, ...updateData } = parsed.data;

  // Update article first, then snapshot the new state with the editor as actor
  const article = await prisma.wikiArticle.update({
    where: { id: existing.id },
    data: { ...updateData, version: { increment: 1 } },
  });

  await prisma.wikiArticleVersion.create({
    data: {
      articleId: existing.id,
      version: nextVersion,
      title: article.title,
      content: article.content,
      tags: article.tags,
      message: message || null,
      actorId: userId,
    },
  });

  // Re-sync backlinks if content changed
  if (parsed.data.content !== undefined) {
    await syncBacklinks(existing.id, article.content, userId, article.teamId);
  }

  return NextResponse.json(article);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamId = getTeamIdFromRequest(req);
  const existing = await findArticleBySlug(params.slug, userId, teamId);
  if (!existing) return notFound("Article not found");

  // For team articles, only admins can delete
  if (existing.teamId) {
    const admin = await isTeamAdmin(userId, existing.teamId);
    if (!admin) {
      return NextResponse.json(
        { error: "Only team admins can delete team articles" },
        { status: 403 }
      );
    }
  }

  await prisma.wikiArticle.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
