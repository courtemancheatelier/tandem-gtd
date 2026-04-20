import { prisma } from "@/lib/prisma";
import type { ImportPreview } from "./types";

/**
 * Mutates the preview in-place, setting isDuplicate flags on items that
 * match existing data for the given user.
 */
export async function detectDuplicates(
  userId: string,
  preview: ImportPreview
): Promise<void> {
  // Fetch existing entities in parallel
  const [
    existingTasks,
    existingProjects,
    existingContexts,
    existingAreas,
    existingGoals,
    existingWikiArticles,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { userId },
      select: { title: true, project: { select: { title: true } } },
    }),
    prisma.project.findMany({
      where: { userId, teamId: null },
      select: { title: true },
    }),
    prisma.context.findMany({
      where: { userId },
      select: { name: true },
    }),
    prisma.area.findMany({
      where: { userId },
      select: { name: true },
    }),
    prisma.goal.findMany({
      where: { userId },
      select: { title: true },
    }),
    prisma.wikiArticle.findMany({
      where: { userId, teamId: null },
      select: { slug: true },
    }),
  ]);

  // Tasks — match by title (case insensitive) + project title
  const taskSet = new Set(
    existingTasks.map(
      (t) => `${t.title.toLowerCase()}|${(t.project?.title ?? "").toLowerCase()}`
    )
  );
  for (const task of preview.tasks) {
    const key = `${task.title.toLowerCase()}|${(task.projectTitle ?? "").toLowerCase()}`;
    if (taskSet.has(key)) {
      task.isDuplicate = true;
      task.duplicateAction = "skip";
    }
  }

  // Projects — match by title (case insensitive)
  const projectSet = new Set(
    existingProjects.map((p) => p.title.toLowerCase())
  );
  for (const project of preview.projects) {
    if (projectSet.has(project.title.toLowerCase())) {
      project.isDuplicate = true;
      project.duplicateAction = "skip";
    }
  }

  // Contexts — match by name (case insensitive)
  const contextSet = new Set(
    existingContexts.map((c) => c.name.toLowerCase())
  );
  for (const context of preview.contexts) {
    if (contextSet.has(context.name.toLowerCase())) {
      context.isDuplicate = true;
    }
  }

  // Areas — match by name (case insensitive)
  const areaSet = new Set(existingAreas.map((a) => a.name.toLowerCase()));
  for (const area of preview.areas) {
    if (areaSet.has(area.name.toLowerCase())) {
      area.isDuplicate = true;
    }
  }

  // Goals — match by title (case insensitive)
  const goalSet = new Set(existingGoals.map((g) => g.title.toLowerCase()));
  for (const goal of preview.goals) {
    if (goalSet.has(goal.title.toLowerCase())) {
      goal.isDuplicate = true;
    }
  }

  // Wiki articles — match by slug
  const wikiSet = new Set(
    existingWikiArticles.map((a) => a.slug.toLowerCase())
  );
  for (const article of preview.wikiArticles) {
    if (wikiSet.has(article.slug.toLowerCase())) {
      article.isDuplicate = true;
    }
  }
}
