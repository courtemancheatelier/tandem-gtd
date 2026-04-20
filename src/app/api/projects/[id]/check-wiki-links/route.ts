import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { slugify } from "@/lib/validations/wiki";

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const targetTeamId = searchParams.get("targetTeamId") || null;

  const teamIds = await getUserTeamIds(userId);

  // Fetch project with all task notes
  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
    include: {
      tasks: { select: { title: true, notes: true } },
    },
  });

  if (!project) return notFound("Project not found");

  // Parse [[Title]] patterns from all task notes
  const wikiRefs: { taskTitle: string; wikiTitle: string; wikiSlug: string }[] = [];
  for (const task of project.tasks) {
    if (!task.notes) continue;
    WIKI_LINK_REGEX.lastIndex = 0;
    let match;
    while ((match = WIKI_LINK_REGEX.exec(task.notes)) !== null) {
      const content = match[1].trim();
      // Strip section reference (e.g. "Title#Section" → "Title")
      const hashIndex = content.indexOf("#");
      const title = hashIndex !== -1 ? content.slice(0, hashIndex).trim() : content;
      const slug = slugify(title);
      wikiRefs.push({ taskTitle: task.title, wikiTitle: title, wikiSlug: slug });
    }
  }

  if (wikiRefs.length === 0) {
    return NextResponse.json({ brokenLinks: [] });
  }

  // Deduplicate slugs for the DB query
  const uniqueSlugs = Array.from(new Set(wikiRefs.map((r) => r.wikiSlug)));

  // Check which slugs exist in the target scope (target team + personal)
  const existingArticles = await prisma.wikiArticle.findMany({
    where: {
      slug: { in: uniqueSlugs },
      OR: [
        ...(targetTeamId ? [{ teamId: targetTeamId }] : []),
        { userId, teamId: null },
      ],
    },
    select: { slug: true },
  });

  const existingSlugs = new Set(existingArticles.map((a) => a.slug));

  const brokenLinks = wikiRefs.filter((ref) => !existingSlugs.has(ref.wikiSlug));

  return NextResponse.json({ brokenLinks });
}
