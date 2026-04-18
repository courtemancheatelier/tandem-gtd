import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { isTeamMember } from "@/lib/services/team-permissions";
import { syncBacklinks } from "@/lib/services/wiki-backlinks";
import { z } from "zod";

const moveSchema = z.object({
  articleId: z.string().min(1),
  targetTeamId: z.string().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { articleId, targetTeamId } = parsed.data;

  // Find the article
  const article = await prisma.wikiArticle.findUnique({
    where: { id: articleId },
  });
  if (!article) return notFound("Article not found");

  // Verify the user has access to the source article
  if (article.teamId) {
    const member = await isTeamMember(userId, article.teamId);
    if (!member) return notFound("Article not found");
  } else if (article.userId !== userId) {
    return notFound("Article not found");
  }

  // If moving to a team, verify membership
  if (targetTeamId) {
    const member = await isTeamMember(userId, targetTeamId);
    if (!member) {
      return badRequest("You are not a member of this team");
    }

    // Check slug uniqueness in target team
    const conflict = await prisma.wikiArticle.findFirst({
      where: { teamId: targetTeamId, slug: article.slug, id: { not: article.id } },
    });
    if (conflict) {
      return badRequest(`An article with the slug "${article.slug}" already exists in that team.`);
    }
  } else {
    // Moving to personal — check slug uniqueness for this user
    const conflict = await prisma.wikiArticle.findFirst({
      where: { userId, teamId: null, slug: article.slug, id: { not: article.id } },
    });
    if (conflict) {
      return badRequest(`You already have a personal article with the slug "${article.slug}".`);
    }
  }

  const updated = await prisma.wikiArticle.update({
    where: { id: articleId },
    data: { teamId: targetTeamId },
  });

  // Resync backlinks — scope has changed so targets may differ
  await syncBacklinks(updated.id, updated.content, userId, targetTeamId);

  return NextResponse.json(updated);
}
