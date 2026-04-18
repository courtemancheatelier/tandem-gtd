import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { createHash } from "crypto";
import matter from "gray-matter";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const HELP_DIR = join(process.cwd(), "docs/help");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(str: string): string {
  return str
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getMarkdownFiles(fullPath)));
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function seedHelp() {
  console.log("Seeding help articles from docs/help/...");

  const files = await getMarkdownFiles(HELP_DIR);
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const filePath of files) {
    const raw = await readFile(filePath, "utf-8");
    const { data: frontmatter, content } = matter(raw);
    const sourceFile = relative(HELP_DIR, filePath);
    const sourceHash = createHash("sha256").update(raw).digest("hex");

    // Derive slug from frontmatter or filename (without .md extension)
    const fileBaseName = sourceFile.replace(/\.md$/, "").split("/").pop() || sourceFile;
    const slug = frontmatter.slug || slugify(fileBaseName);

    // Derive category from frontmatter or parent directory
    const dirName = sourceFile.split("/")[0];
    const category = frontmatter.category || titleCase(dirName);

    const existing = await prisma.helpArticle.findUnique({
      where: { sourceFile },
    });

    if (!existing) {
      await prisma.helpArticle.create({
        data: {
          slug,
          title: frontmatter.title || titleCase(slug),
          content: content.trim(),
          category,
          tags: frontmatter.tags || [],
          sortOrder: frontmatter.sortOrder ?? 0,
          adminOnly: frontmatter.adminOnly ?? false,
          sourceFile,
          sourceHash,
        },
      });
      created++;
      console.log(`  + Created: ${sourceFile} → /help/${slug}`);
    } else if (existing.sourceHash !== sourceHash) {
      await prisma.helpArticle.update({
        where: { sourceFile },
        data: {
          slug,
          title: frontmatter.title || existing.title,
          content: content.trim(),
          category,
          tags: frontmatter.tags || existing.tags,
          sortOrder: frontmatter.sortOrder ?? existing.sortOrder,
          adminOnly: frontmatter.adminOnly ?? existing.adminOnly,
          sourceHash,
        },
      });
      updated++;
      console.log(`  ~ Updated: ${sourceFile} → /help/${slug}`);
    } else {
      unchanged++;
    }
  }

  console.log(
    `\nHelp articles seeded: ${created} created, ${updated} updated, ${unchanged} unchanged`
  );
}

seedHelp()
  .catch((e) => {
    console.error("Failed to seed help articles:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
