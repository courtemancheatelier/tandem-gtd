import { z } from "zod";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const createWikiArticleSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    slug: z.string().max(200).optional(),
    content: z.string().min(1, "Content is required"),
    tags: z.array(z.string().max(50)).max(20).optional(),
    teamId: z.string().nullable().optional(),
  })
  .transform((data) => ({
    ...data,
    slug: data.slug || slugify(data.title),
    tags: data.tags ?? [],
  }));

export const updateWikiArticleSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200).optional(),
    slug: z.string().max(200).optional(),
    content: z.string().min(1, "Content is required").optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    message: z.string().max(500).optional(),
    expectedUpdatedAt: z.string().datetime().optional(), // Deprecated: use version instead
    version: z.number().int().positive().optional(),
  })
  .transform((data) => {
    const result: Record<string, unknown> = { ...data };
    if (data.title && !data.slug) {
      result.slug = slugify(data.title);
    }
    return result as {
      title?: string;
      slug?: string;
      content?: string;
      tags?: string[];
      message?: string;
      expectedUpdatedAt?: string;
      version?: number;
    };
  });

export type CreateWikiArticleInput = z.infer<typeof createWikiArticleSchema>;
export type UpdateWikiArticleInput = z.infer<typeof updateWikiArticleSchema>;
export { slugify };
