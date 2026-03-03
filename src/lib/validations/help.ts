import { z } from "zod";
import { slugify } from "./wiki";

export const createHelpArticleSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    slug: z.string().regex(/^[a-z0-9-]+$/).max(200).optional(),
    content: z.string().min(1, "Content is required"),
    category: z.string().min(1, "Category is required").max(100),
    tags: z.array(z.string().max(50)).max(20).optional(),
    sortOrder: z.number().int().optional(),
    adminOnly: z.boolean().optional(),
  })
  .transform((data) => ({
    ...data,
    slug: data.slug || slugify(data.title),
    tags: data.tags ?? [],
    sortOrder: data.sortOrder ?? 0,
    adminOnly: data.adminOnly ?? false,
  }));

export const updateHelpArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  content: z.string().min(1, "Content is required").optional(),
  category: z.string().min(1, "Category is required").max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  sortOrder: z.number().int().optional(),
  adminOnly: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

export type CreateHelpArticleInput = z.infer<typeof createHelpArticleSchema>;
export type UpdateHelpArticleInput = z.infer<typeof updateHelpArticleSchema>;
export { slugify };
