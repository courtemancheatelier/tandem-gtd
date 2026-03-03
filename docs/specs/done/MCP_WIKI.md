# MCP Wiki Support — AI-Powered Knowledge Base Access

> **Status:** Draft
> **Last updated:** 2026-02-24

---

## 1. Problem Statement

### The Need

Tandem's personal wiki has a full-featured API — CRUD, version history, backlinks, wikilink resolution, tag filtering, and full-text search. But the MCP server has zero wiki tools or resources. An AI assistant connected via MCP cannot read, create, search, or update wiki articles.

This is a significant gap because the wiki is where users store reference material, meeting notes, project documentation, and decision records. When a user asks "what did I write about X?" or "add this to my notes on Y," the AI is blind.

The wiki also has `[[wikilink]]` syntax that cross-references articles — an AI that can read and write articles with wikilinks creates a connected knowledge graph that grows more useful over time.

### What "Done" Looks Like

1. AI can **search and read** wiki articles (by slug, by title, by content, by tag)
2. AI can **create and update** articles with proper markdown, tags, and wikilinks
3. AI can **browse version history** and revert to previous versions
4. AI can **discover connections** via backlinks (which articles link to this one?)
5. A **wiki resource** gives the AI a quick summary of all articles for context
6. All operations scoped to the authenticated user (same as existing MCP tools)

### Design Constraints

- Mirror the existing API surface — the wiki API is well-designed, MCP tools should map 1:1
- Use `slug` as the primary identifier in tools (matches URL pattern, human-readable)
- Version snapshots happen automatically on update (existing behavior, not an MCP concern)
- Wikilinks in content are raw `[[Title]]` syntax — the AI writes them as markdown, rendering handles the rest

---

## 2. MCP Tools

### 2.1 tandem_wiki_search

Search wiki articles by title, content, or tag.

```ts
{
  name: "tandem_wiki_search",
  description: "Search wiki articles by title/content text or filter by tag. Returns titles, slugs, tags, and content snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text — matches against article titles and content (case-insensitive)",
      },
      tag: {
        type: "string",
        description: "Filter by tag name (exact match)",
      },
    },
  },
}
```

**Handler:**
```ts
const userId = getUserId();
const articles = await getPrisma().wikiArticle.findMany({
  where: {
    userId,
    ...(query && {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    }),
    ...(tag && { tags: { has: tag } }),
  },
  select: {
    id: true, slug: true, title: true, tags: true,
    content: true, updatedAt: true,
  },
  orderBy: { updatedAt: "desc" },
  take: 50,
});

// Generate snippets for search matches
return articles.map(a => ({
  slug: a.slug,
  title: a.title,
  tags: a.tags,
  updatedAt: a.updatedAt.toISOString(),
  ...(query && { snippet: extractSnippet(a.content, query, 80) }),
}));
```

### 2.2 tandem_wiki_read

Read a wiki article by slug.

```ts
{
  name: "tandem_wiki_read",
  description: "Read a wiki article by its slug. Returns the full markdown content, tags, and metadata.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The article slug (URL-safe identifier, e.g. 'meeting-notes-feb-24')",
      },
    },
    required: ["slug"],
  },
}
```

**Handler:**
```ts
const article = await getPrisma().wikiArticle.findUnique({
  where: { userId_slug: { userId: getUserId(), slug } },
  select: {
    id: true, slug: true, title: true, content: true,
    tags: true, createdAt: true, updatedAt: true,
  },
});
if (!article) throw new Error(`Wiki article '${slug}' not found`);
return article;
```

### 2.3 tandem_wiki_create

Create a new wiki article.

```ts
{
  name: "tandem_wiki_create",
  description: "Create a new wiki article. Use [[Title]] syntax to link to other articles. Slug is auto-generated from the title if not provided.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Article title (1-200 characters)",
      },
      content: {
        type: "string",
        description: "Article content in markdown. Use [[Article Title]] to create wikilinks to other articles.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags for categorization (max 20, each max 50 chars)",
      },
      slug: {
        type: "string",
        description: "Optional custom slug. Auto-generated from title if not provided.",
      },
    },
    required: ["title", "content"],
  },
}
```

**Handler:**
```ts
const userId = getUserId();
const articleSlug = slug || slugify(title);

// Check uniqueness
const existing = await getPrisma().wikiArticle.findUnique({
  where: { userId_slug: { userId, slug: articleSlug } },
});
if (existing) throw new Error(`Article with slug '${articleSlug}' already exists`);

const article = await getPrisma().wikiArticle.create({
  data: {
    title,
    slug: articleSlug,
    content,
    tags: tags || [],
    userId,
  },
});

return { slug: article.slug, title: article.title, message: "Article created" };
```

### 2.4 tandem_wiki_update

Update an existing wiki article. Automatically creates a version snapshot.

```ts
{
  name: "tandem_wiki_update",
  description: "Update a wiki article's title, content, or tags. Automatically saves a version snapshot before updating. Use the message field to describe what changed.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug of the article to update",
      },
      title: {
        type: "string",
        description: "New title (1-200 chars). Omit to keep current.",
      },
      content: {
        type: "string",
        description: "New content in markdown. Omit to keep current.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "New tags array. Omit to keep current.",
      },
      message: {
        type: "string",
        description: "Optional commit-style message describing the edit (max 500 chars)",
      },
    },
    required: ["slug"],
  },
}
```

**Handler:**
```ts
const userId = getUserId();
const article = await getPrisma().wikiArticle.findUnique({
  where: { userId_slug: { userId, slug } },
});
if (!article) throw new Error(`Wiki article '${slug}' not found`);

// Create version snapshot of current state
const lastVersion = await getPrisma().wikiArticleVersion.findFirst({
  where: { articleId: article.id },
  orderBy: { version: "desc" },
  select: { version: true },
});

await getPrisma().wikiArticleVersion.create({
  data: {
    articleId: article.id,
    version: (lastVersion?.version ?? 0) + 1,
    title: article.title,
    content: article.content,
    tags: article.tags,
    message: message || null,
  },
});

// Update article
const newSlug = title ? slugify(title) : undefined;
const updated = await getPrisma().wikiArticle.update({
  where: { id: article.id },
  data: {
    ...(title && { title }),
    ...(newSlug && { slug: newSlug }),
    ...(content !== undefined && { content }),
    ...(tags !== undefined && { tags }),
  },
});

return { slug: updated.slug, title: updated.title, message: "Article updated" };
```

### 2.5 tandem_wiki_delete

Delete a wiki article and all its versions.

```ts
{
  name: "tandem_wiki_delete",
  description: "Delete a wiki article and all its version history. This cannot be undone.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug of the article to delete",
      },
    },
    required: ["slug"],
  },
}
```

**Handler:**
```ts
const userId = getUserId();
const article = await getPrisma().wikiArticle.findUnique({
  where: { userId_slug: { userId, slug } },
});
if (!article) throw new Error(`Wiki article '${slug}' not found`);

await getPrisma().wikiArticle.delete({ where: { id: article.id } });
return { message: `Article '${article.title}' deleted` };
```

### 2.6 tandem_wiki_history

View version history of an article.

```ts
{
  name: "tandem_wiki_history",
  description: "View the version history of a wiki article. Returns version numbers, timestamps, and edit messages (not full content).",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug of the article",
      },
    },
    required: ["slug"],
  },
}
```

**Handler:**
```ts
const article = await getPrisma().wikiArticle.findUnique({
  where: { userId_slug: { userId: getUserId(), slug } },
  select: { id: true, title: true },
});
if (!article) throw new Error(`Wiki article '${slug}' not found`);

const versions = await getPrisma().wikiArticleVersion.findMany({
  where: { articleId: article.id },
  select: { id: true, version: true, title: true, message: true, createdAt: true },
  orderBy: { version: "desc" },
});

return { article: article.title, versions };
```

### 2.7 tandem_wiki_backlinks

Find articles that link to a given article via `[[wikilinks]]`.

```ts
{
  name: "tandem_wiki_backlinks",
  description: "Find all wiki articles that link to a given article using [[wikilink]] syntax. Useful for discovering connections in your knowledge base.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The slug of the article to find backlinks for",
      },
    },
    required: ["slug"],
  },
}
```

**Handler:**
```ts
const userId = getUserId();
const article = await getPrisma().wikiArticle.findUnique({
  where: { userId_slug: { userId, slug } },
  select: { id: true, title: true },
});
if (!article) throw new Error(`Wiki article '${slug}' not found`);

// Find articles containing [[Title]] (case-insensitive)
const backlinks = await getPrisma().wikiArticle.findMany({
  where: {
    userId,
    id: { not: article.id },
    content: { contains: `[[${article.title}]]`, mode: "insensitive" },
  },
  select: { slug: true, title: true, updatedAt: true },
  orderBy: { updatedAt: "desc" },
});

return { article: article.title, backlinks };
```

---

## 3. MCP Resource

### tandem://wiki

Read-only summary of all wiki articles — titles, slugs, tags, and last updated. Gives the AI a quick index of the entire knowledge base without fetching full content.

**File:** `src/mcp/resources.ts`

```ts
{
  uri: "tandem://wiki",
  name: "Wiki Index",
  description: "All wiki articles with titles, slugs, tags, and last updated dates. Read an individual article with tandem_wiki_read.",
  mimeType: "application/json",
}
```

**Handler:**
```ts
const articles = await getPrisma().wikiArticle.findMany({
  where: { userId: getUserId() },
  select: { slug: true, title: true, tags: true, updatedAt: true },
  orderBy: { updatedAt: "desc" },
});

return {
  articleCount: articles.length,
  articles: articles.map(a => ({
    slug: a.slug,
    title: a.title,
    tags: a.tags,
    updatedAt: a.updatedAt.toISOString(),
  })),
  tags: [...new Set(articles.flatMap(a => a.tags))].sort(),
};
```

The `tags` array at the top level gives the AI a quick view of all tags in use — useful for categorizing new articles consistently.

---

## 4. AI Use Cases This Enables

With these tools, an AI assistant can:

- **"What did I write about the Johnson meeting?"** → `tandem_wiki_search` with query "Johnson meeting" → read the matching article
- **"Save this as a wiki article"** → `tandem_wiki_create` with the content formatted as markdown
- **"Add a section about budget to my Q1 planning article"** → `tandem_wiki_read` the article → `tandem_wiki_update` with appended content and message "Added budget section"
- **"What links to my Architecture Decisions article?"** → `tandem_wiki_backlinks` → shows connected articles
- **"Tag all my meeting notes articles with 'meetings'"** → `tandem_wiki_search` with query "meeting notes" → `tandem_wiki_update` each with tags
- **"Show me the history of changes to this article"** → `tandem_wiki_history` → timeline of edits
- **"What topics do I have wiki articles on?"** → read `tandem://wiki` resource → summarize by tags

---

## 5. Implementation Plan

### Phase 1 — Read Tools + Resource

1. Add `tandem_wiki_search` tool
2. Add `tandem_wiki_read` tool
3. Add `tandem_wiki_backlinks` tool
4. Add `tandem_wiki_history` tool
5. Add `tandem://wiki` resource

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/mcp/tools.ts` |
| MODIFY | `src/mcp/resources.ts` |

**Test:** Ask AI "what wiki articles do I have?" → reads resource. Ask "what did I write about X?" → searches and reads article.

### Phase 2 — Write Tools

1. Add `tandem_wiki_create` tool
2. Add `tandem_wiki_update` tool (with version snapshot)
3. Add `tandem_wiki_delete` tool

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/mcp/tools.ts` |

**Test:** Ask AI "save this as a wiki article called X" → creates article. Ask "add a section about Y to my Z article" → reads then updates. Verify version history shows the edit.

---

## 6. Edge Cases

### Article Not Found
All slug-based tools return a clear error: `Wiki article '{slug}' not found`. The AI can suggest searching instead.

### Slug Conflicts on Create
If a generated slug already exists, return an error with the conflicting slug. The AI can either suggest a different title or provide an explicit slug.

### Slug Changes on Title Update
When title changes via `tandem_wiki_update`, the slug auto-regenerates. This can break existing `[[wikilinks]]` in other articles that referenced the old title. The AI should be aware of this — the tool description could note it. For now, this matches the existing web UI behavior.

### Large Articles
Wiki content is `@db.Text` (unlimited). Very large articles returned via MCP may hit token limits in the AI context. The `tandem_wiki_search` tool returns snippets (not full content) to mitigate this. The `tandem://wiki` resource returns only metadata.

### Wikilinks in AI-Created Content
The AI writes raw `[[Title]]` syntax in content. If the linked article doesn't exist yet, the link will be a dead link in the UI (red/broken styling). This is standard wiki behavior — create the linked article later.

---

## 7. What This Spec Does Not Cover

- **Version diff via MCP** — the web UI has side-by-side diff. Exposing raw content of two versions via MCP is possible but the AI can compare them itself.
- **Version revert via MCP** — the API supports it (`POST /api/wiki/[slug]/history/[versionId]/revert`). Could add as a tool later if needed. Low priority since it's a rare operation.
- **Wikilink autocomplete** — the web UI has `[[` autocomplete. In MCP context, the AI can search for articles and construct the wikilink itself.
- **Team wiki** — the Wiki Collaboration spec covers team-shared wikis. MCP team wiki support would layer on top of both this spec and the MCP Teams spec.
- **Bulk operations** — creating/updating multiple articles in one call. The AI can loop through individual tool calls.
