# Wiki Scalability — Pagination, Full-Text Search & Storage Optimization

> **Status:** Draft
> **Last updated:** 2026-02-24

---

## 1. Problem Statement

### The Need

The wiki works fine for a single user with a handful of articles. But Tandem is heading toward 10–100+ users, each creating articles — and with AI assistance (MCP wiki tools), content creation will accelerate dramatically. The current implementation has several scalability gaps that will degrade performance as data grows:

1. **No pagination** — `GET /api/wiki` returns every article matching the filter in a single response. The backlinks and version history endpoints are also unbounded.
2. **LIKE-based search** — All text search uses Prisma `contains` (SQL `ILIKE '%query%'`), which triggers a sequential scan of every row's `content` column (`@db.Text`, unlimited size). PostgreSQL cannot use a B-tree index for middle-of-string matches.
3. **Full content in list responses** — The article list endpoint selects `content` for every article (used for snippet extraction), transferring potentially megabytes of text just to show a list page.
4. **No full-text search index** — No `tsvector`/`tsquery`, no trigram (`pg_trgm`) index, no relevance ranking. Search results are unranked.
5. **Version storage multiplies** — Each edit creates a full copy of the article content in `WikiArticleVersion`. An article edited 50 times stores 50 complete copies.
6. **No GIN index on tags** — The `tags String[]` field supports `{ has: tag }` filtering, but no GIN index is declared, so tag filtering scans every row.
7. **Backlinks scan all content** — `GET /api/wiki/[slug]/backlinks` runs `ILIKE '%[[Title]]%'` across every article's full content. This is the most expensive query pattern in the wiki.

### Scale Projections

| Scenario | Articles | Versions | Avg Content Size | Total Storage |
|----------|----------|----------|------------------|---------------|
| Today (1 user, light use) | ~20 | ~50 | 2 KB | ~140 KB |
| 10 users, moderate use | ~500 | ~2,000 | 3 KB | ~7.5 MB |
| 100 users, AI-assisted | ~10,000 | ~50,000 | 5 KB | ~300 MB |
| 100 users, heavy AI use | ~50,000 | ~250,000 | 5 KB | ~1.5 GB |

At 10,000+ articles, every unindexed `ILIKE` search scans 50+ MB of text. At 50,000 articles with 250K versions, storage becomes significant and queries without proper indexes will take seconds.

### What "Done" Looks Like

1. All list endpoints use cursor or offset pagination with configurable limits and hard caps
2. Full-text search uses PostgreSQL `tsvector`/`tsquery` with GIN index — fast, ranked results
3. List endpoints return metadata only (not full content) — content fetched per-article
4. Backlinks are indexed (not computed via full-text scan on every request)
5. Version storage is optimized (diff-based or pruned)
6. Tags have a GIN index for fast array filtering
7. MCP wiki tools (when implemented per MCP_WIKI.md spec) inherit these scalability patterns

### Design Constraints

- All changes must be backward-compatible with the existing web UI
- PostgreSQL-native solutions preferred (no external search services for beta)
- Prisma 5 supports raw SQL for features like `tsvector` that aren't in the Prisma DSL
- The MCP wiki spec (MCP_WIKI.md) already specifies `take: 50` on search — ensure the API matches

---

## 2. Pagination

### 2.1 Article List — `GET /api/wiki`

Add cursor-based pagination using `updatedAt` timestamp (matches existing sort order and the pattern used in `/api/history/feed`).

**Query params:**
- `limit` — number of articles to return (default 20, max 100)
- `before` — ISO 8601 timestamp cursor (return articles updated before this time)

```ts
const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
const before = searchParams.get("before");

const articles = await prisma.wikiArticle.findMany({
  where: {
    ...where,
    ...(before && { updatedAt: { lt: new Date(before) } }),
  },
  orderBy: { updatedAt: "desc" },
  take: limit + 1, // fetch one extra to determine hasMore
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
    // NO content — see section 3
  },
});

const hasMore = articles.length > limit;
const results = hasMore ? articles.slice(0, limit) : articles;

return NextResponse.json({
  articles: results,
  hasMore,
  nextCursor: hasMore ? results[results.length - 1].updatedAt.toISOString() : null,
});
```

**Breaking change:** The response shape changes from a flat array to `{ articles, hasMore, nextCursor }`. The wiki list page component must be updated to handle the new shape and implement infinite scroll or "Load more."

### 2.2 Version History — `GET /api/wiki/[slug]/history`

Add simple limit + offset pagination (version numbers are sequential integers, making offset natural).

```ts
const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
const offset = parseInt(searchParams.get("offset") ?? "0", 10);

const [versions, total] = await Promise.all([
  prisma.wikiArticleVersion.findMany({
    where: { articleId: article.id },
    select: { id: true, version: true, title: true, message: true, createdAt: true, actor: true },
    orderBy: { version: "desc" },
    take: limit,
    skip: offset,
  }),
  prisma.wikiArticleVersion.count({ where: { articleId: article.id } }),
]);

return NextResponse.json({ versions, total, hasMore: offset + limit < total });
```

### 2.3 Backlinks — `GET /api/wiki/[slug]/backlinks`

Add a simple limit (backlinks are typically a short list, but should still be bounded).

```ts
const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

// After indexed backlinks are implemented (section 4):
const backlinks = await prisma.wikiBacklink.findMany({
  where: { targetArticleId: article.id },
  take: limit,
  select: { sourceArticle: { select: { slug: true, title: true, updatedAt: true } } },
  orderBy: { sourceArticle: { updatedAt: "desc" } },
});
```

### 2.4 MCP Tools

The MCP_WIKI.md spec already defines `take: 50` for `tandem_wiki_search`. Ensure all MCP wiki tools that return lists accept a `limit` parameter (default 50, max 100) matching this pattern. The `tandem://wiki` resource should also cap at a reasonable number (e.g., 200 articles in the index).

---

## 3. Remove Content from List Responses

### The Problem

The article list endpoint currently selects `content` for every article — used only for snippet extraction when searching. This means a page load showing 50 articles transfers 50 full article bodies.

### The Fix

**Without search:** Don't select `content` at all. The list only needs metadata.

**With search:** Use a database-level snippet extraction instead of fetching full content and scanning in JavaScript. With full-text search (section 4), PostgreSQL's `ts_headline()` generates snippets server-side:

```sql
SELECT id, slug, title, tags,
  ts_headline('english', content, plainto_tsquery('english', $1),
    'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS snippet
FROM "WikiArticle"
WHERE search_vector @@ plainto_tsquery('english', $1)
  AND "userId" = $2
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
LIMIT $3;
```

This returns only the snippet text, not the full content, and does it in the database where the data already lives.

**Interim fix (before full-text search):** If implementing pagination before full-text search, keep `content` in the select only when `?search` is present, and limit results with `take`:

```ts
select: {
  ...baseSelect,
  ...(search && { content: true }), // Only fetch content when needed for snippets
},
take: limit + 1,
```

---

## 4. Full-Text Search

### 4.1 Add Search Vector Column

Add a `tsvector` column to `WikiArticle` that combines title (weighted A) and content (weighted B) for relevance ranking.

**Migration SQL:**

```sql
-- Add the search vector column
ALTER TABLE "WikiArticle" ADD COLUMN search_vector tsvector;

-- Populate from existing data
UPDATE "WikiArticle" SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');

-- Create GIN index for fast lookup
CREATE INDEX wiki_article_search_idx ON "WikiArticle" USING GIN (search_vector);

-- Auto-update trigger
CREATE FUNCTION wiki_article_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER wiki_article_search_update
  BEFORE INSERT OR UPDATE OF title, content ON "WikiArticle"
  FOR EACH ROW EXECUTE FUNCTION wiki_article_search_trigger();
```

**Prisma schema addition:**

```prisma
model WikiArticle {
  // ... existing fields ...
  searchVector Unsupported("tsvector")?

  @@index([searchVector], type: Gin)
}
```

Prisma doesn't natively support `tsvector` queries, so search queries use `$queryRaw`:

```ts
const articles = await prisma.$queryRaw`
  SELECT id, slug, title, tags, "updatedAt",
    ts_headline('english', content, plainto_tsquery('english', ${search}),
      'MaxWords=35, MinWords=15') AS snippet,
    ts_rank(search_vector, plainto_tsquery('english', ${search})) AS rank
  FROM "WikiArticle"
  WHERE search_vector @@ plainto_tsquery('english', ${search})
    AND "userId" = ${userId}
  ORDER BY rank DESC
  LIMIT ${limit}
`;
```

### 4.2 Benefits Over ILIKE

| Feature | ILIKE (current) | tsvector/tsquery |
|---------|-----------------|------------------|
| Index support | No (seq scan) | GIN index |
| Relevance ranking | None | `ts_rank()` — title matches rank higher |
| Stemming | No ("running" won't match "run") | Yes (language-aware) |
| Stop words | No (searches for "the", "a", etc.) | Filtered out |
| Snippets | In-memory JS (fetch full content) | `ts_headline()` (DB-side) |
| Performance at 10K articles | ~2-5 seconds | ~10-50ms |

### 4.3 Fallback for Non-English Content

The `'english'` dictionary handles stemming for English. For mixed-language wikis, use `'simple'` dictionary (no stemming, but still tokenized and indexed). Can be made configurable later.

---

## 5. Indexed Backlinks

### The Problem

Backlinks are currently computed on every request by scanning all articles' content for `[[Title]]` patterns. This is O(n) where n = total content size of all articles in scope.

### The Fix — Backlink Table

Add a `WikiBacklink` join table that's maintained on article create/update/delete.

**Schema:**

```prisma
model WikiBacklink {
  id              String      @id @default(cuid())
  sourceArticleId String
  targetArticleId String
  sourceArticle   WikiArticle @relation("BacklinkSource", fields: [sourceArticleId], references: [id], onDelete: Cascade)
  targetArticle   WikiArticle @relation("BacklinkTarget", fields: [targetArticleId], references: [id], onDelete: Cascade)

  @@unique([sourceArticleId, targetArticleId])
  @@index([targetArticleId])
  @@index([sourceArticleId])
}
```

**Extraction logic:**

```ts
function extractWikilinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2).trim()))];
}
```

**On article create/update:**

```ts
async function syncBacklinks(articleId: string, content: string, userId: string) {
  const titles = extractWikilinks(content);

  // Resolve titles to article IDs
  const targets = await prisma.wikiArticle.findMany({
    where: { userId, title: { in: titles, mode: "insensitive" } },
    select: { id: true },
  });

  // Replace all backlinks from this article
  await prisma.$transaction([
    prisma.wikiBacklink.deleteMany({ where: { sourceArticleId: articleId } }),
    ...targets.map(t =>
      prisma.wikiBacklink.create({
        data: { sourceArticleId: articleId, targetArticleId: t.id },
      })
    ),
  ]);
}
```

**Backlinks query becomes a simple join:**

```ts
const backlinks = await prisma.wikiBacklink.findMany({
  where: { targetArticleId: article.id },
  select: {
    sourceArticle: { select: { slug: true, title: true, updatedAt: true } },
  },
});
```

This is O(1) indexed lookup vs the current O(n) content scan.

---

## 6. GIN Index on Tags

Add a GIN index on the `tags` array column for fast `{ has: tag }` filtering.

**Migration SQL:**

```sql
CREATE INDEX wiki_article_tags_idx ON "WikiArticle" USING GIN (tags);
```

**Prisma schema:**

```prisma
@@index([tags], type: Gin)
```

Without this index, every `{ tags: { has: "meeting-notes" } }` filter scans every row's tags array.

---

## 7. Version Storage Optimization

### The Problem

Each `WikiArticleVersion` stores a full copy of the article's `content`. An article with 10 KB of content edited 100 times stores 1 MB of versions — mostly redundant since edits are typically small changes.

### Options

**Option A: Diff-based storage (recommended for later)**

Store diffs instead of full content. Use a library like `diff-match-patch` to compute and store patches. Reconstructing a version requires applying patches sequentially from the base version.

- Pros: 10-50x storage reduction for incremental edits
- Cons: Slower version reads (must reconstruct), more complex code
- Recommendation: Implement only if version storage becomes a measurable problem

**Option B: Version pruning**

Keep only the last N versions per article (e.g., 50). Older versions are automatically deleted.

```ts
// After creating a new version:
const oldVersions = await prisma.wikiArticleVersion.findMany({
  where: { articleId },
  orderBy: { version: "desc" },
  skip: 50, // keep 50 most recent
  select: { id: true },
});
if (oldVersions.length > 0) {
  await prisma.wikiArticleVersion.deleteMany({
    where: { id: { in: oldVersions.map(v => v.id) } },
  });
}
```

- Pros: Simple, bounded storage
- Cons: Loses old history

**Option C: No change (recommended for now)**

At current scale, version storage is not a problem. Monitor and revisit when:
- Any single article exceeds 100 versions
- Total `WikiArticleVersion` table exceeds 100 MB
- A user reports slow version history loads

### Recommendation

Do nothing now. Add monitoring. Implement Option B (pruning at 50 versions) as the first scaling step since it's trivial. Consider Option A only if storage costs become significant.

---

## 8. Implementation Plan

### Phase 1 — Pagination + Content Removal (Low Risk, High Impact)

1. Add pagination to `GET /api/wiki` (cursor-based, default 20, max 100)
2. Remove `content` from list select (fetch only when `?search` present)
3. Add pagination to `GET /api/wiki/[slug]/history` (offset-based, default 20, max 100)
4. Add limit to `GET /api/wiki/[slug]/backlinks` (default 50, max 100)
5. Update wiki list page component for paginated response shape
6. Update response shape: `{ articles, hasMore, nextCursor }`

**Files:**

| Action | File |
|--------|------|
| MODIFY | `src/app/api/wiki/route.ts` |
| MODIFY | `src/app/api/wiki/[slug]/history/route.ts` |
| MODIFY | `src/app/api/wiki/[slug]/backlinks/route.ts` |
| MODIFY | `src/app/(dashboard)/wiki/page.tsx` (or wherever the wiki list component lives) |

### Phase 2 — GIN Index on Tags + Backlink Table

1. Add GIN index on `WikiArticle.tags`
2. Create `WikiBacklink` model
3. Add backlink sync logic (extract `[[wikilinks]]`, resolve to article IDs, upsert join table)
4. Hook sync into article create, update, and delete
5. Backfill backlinks for existing articles (one-time migration script)
6. Update backlinks endpoint to query join table instead of `ILIKE` scan

**Files:**

| Action | File |
|--------|------|
| MODIFY | `prisma/schema.prisma` |
| CREATE | `src/lib/services/wiki-backlinks.ts` |
| MODIFY | `src/app/api/wiki/route.ts` (POST — sync backlinks on create) |
| MODIFY | `src/app/api/wiki/[slug]/route.ts` (PATCH — sync on update, DELETE — cleanup) |
| MODIFY | `src/app/api/wiki/[slug]/backlinks/route.ts` |
| CREATE | Migration script for backfill |

### Phase 3 — Full-Text Search

1. Add `search_vector tsvector` column to `WikiArticle`
2. Create GIN index on `search_vector`
3. Create trigger to auto-update on insert/update
4. Backfill existing articles
5. Replace `ILIKE` search with `@@ plainto_tsquery()` in wiki list endpoint
6. Use `ts_headline()` for server-side snippet generation
7. Add relevance ranking to search results

**Files:**

| Action | File |
|--------|------|
| MODIFY | `prisma/schema.prisma` (add `Unsupported("tsvector")` field) |
| CREATE | Prisma migration with raw SQL for column, index, trigger |
| MODIFY | `src/app/api/wiki/route.ts` (replace ILIKE with tsquery) |

### Phase 4 — Version Pruning (When Needed)

1. Add version pruning logic (keep last 50 versions per article)
2. Hook into article update flow
3. Add monitoring: log when an article exceeds 100 versions

**Trigger:** Implement when any of these conditions are met:
- `WikiArticleVersion` table exceeds 100 MB
- Any single article exceeds 100 versions
- Version history page load exceeds 500ms

---

## 9. Edge Cases

### Pagination Cursor Collisions

Multiple articles can have the same `updatedAt` timestamp. The cursor-based pagination should use a compound cursor (`updatedAt` + `id`) to avoid skipping articles. For Phase 1, a simple timestamp cursor is sufficient since collisions are rare. Add compound cursor if users report missing articles in list views.

### Backlink Sync on Title Rename

When an article's title changes, existing `[[Old Title]]` references in other articles become dead links. The backlink table reflects the current state — backlinks pointing to the renamed article are removed during the next sync of the source articles. A "find and replace" tool for bulk-updating wikilinks after a rename is out of scope but noted as a future enhancement.

### Full-Text Search Language Detection

The `'english'` text search dictionary is used by default. Articles in other languages won't get stemming benefits. For multi-language support, could store a `language` field per article and use the appropriate dictionary. Out of scope for initial implementation.

### Team-Scoped Backlinks

The `WikiBacklink` table links articles by ID without scope constraints. A team article can reference a personal article (and vice versa). This is correct behavior — wikilinks are resolved at render time with scope-aware lookup. The backlink table just records the connection.

### Search Vector Maintenance

The PostgreSQL trigger keeps `search_vector` in sync on `INSERT` and `UPDATE OF title, content`. Bulk imports (if implemented per IMPORT_EXPORT.md) should trigger the update. Direct SQL updates bypassing the trigger would need a manual `search_vector` refresh.

---

## 10. Monitoring Recommendations

Add these metrics (can be simple log lines or a monitoring endpoint):

| Metric | Threshold | Action |
|--------|-----------|--------|
| `WikiArticle` row count per user | > 500 | Review pagination UX |
| `WikiArticleVersion` total rows | > 100,000 | Implement version pruning |
| `WikiArticleVersion` table size | > 100 MB | Implement version pruning |
| Wiki search P95 latency | > 500ms | Prioritize full-text search |
| Backlinks query P95 latency | > 200ms | Prioritize backlink table |
| Largest single article content size | > 100 KB | Consider content size soft limit |

---

## 11. What This Spec Does Not Cover

- **External search service** (Elasticsearch, Meilisearch, Typesense) — PostgreSQL full-text search is sufficient for the projected scale. Revisit if article count exceeds 100K or search requirements become complex (faceted search, fuzzy matching, typo tolerance).
- **Content size limits** — No per-article or per-user storage quotas. Could be needed for a paid tier model but is a pricing/product decision, not a technical one.
- **Real-time search (typeahead)** — The current search submits on button click. Typeahead would need debouncing and possibly a lighter search endpoint. Out of scope.
- **Search across teams** — The `scope=all` parameter already combines personal + team articles. Full-text search should respect the same scoping. The FTS query just adds the existing `userId`/`teamId` filters.
- **Attachment/file storage** — Wiki articles are text-only (`@db.Text`). If file attachments are added later, storage optimization becomes a larger concern.
