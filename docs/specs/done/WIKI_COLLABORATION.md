# Tandem Feature Spec: Wiki Collaboration — Knowledge Backbone for GTD Teams

**Version:** 1.0
**Date:** February 22, 2026
**Author:** Jason Courtemanche
**Extends:** TEAMS.md, TEAMS_HIERARCHICAL.md
**Status:** Draft

---

## 1. Executive Summary

The wiki is the knowledge backbone of Tandem GTD. Every project has context that doesn't fit in task titles — research findings, meeting notes, reference material, how-to guides, decision rationale. The wiki captures all of it in interlinked articles with `[[wikilinks]]`, making knowledge discoverable and durable rather than scattered across chat messages and forgotten Google Docs.

The wiki evolves through three phases:

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1** | Editor UX — toolbar, preview, TOC, backlinks, search, version history | **Implement now** |
| **Phase 2** | Team Collaboration — shared wikis, permissions, conflict detection | Document only (implement with Teams) |
| **Phase 3** | Decision Integration — auto-generated decision records in wiki | Document only (implement with Decision Proposals) |

Phase 1 makes the personal wiki a pleasure to use. Phase 2 extends it to teams. Phase 3 wires it into the Decision Proposals system so decisions automatically become institutional memory.

### Why a Wiki and Not a Notes App

A notes app is a pile. A wiki is a web. The difference is `[[links]]` — every article can reference any other, creating a navigable knowledge graph. When Jason writes a camping trip packing list and links to `[[Gear Inventory]]`, that relationship is preserved and bidirectional (via backlinks). Six months later, when planning the next trip, the context is all there — not buried in a thread or lost in a notebook.

For teams, the wiki becomes the single source of truth. "Where did we decide to book Kirk Creek?" → open the wiki, it's linked from the decision record. "What's the format for our milonga flyers?" → it's in the wiki, linked from the event project. The wiki is the long-term memory that chat and tasks don't provide.

---

## 2. Current State (What Exists Today)

The wiki has a functional foundation — create, edit, view, search, and interlink articles. This section documents the existing implementation so the spec reads as a complete reference.

### 2.1 Data Model

```prisma
model WikiArticle {
  id        String   @id @default(cuid())
  title     String
  slug      String
  content   String   @db.Text
  tags      String[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, slug])
  @@index([userId])
}
```

Key characteristics:
- **Per-user isolation** — slug uniqueness is scoped to `userId`, not global
- **Markdown content** — stored as raw markdown in a `Text` column
- **Tags as array** — PostgreSQL `String[]` for lightweight categorization
- **No versioning** — edits overwrite in place, no history

### 2.2 Components

**`WikiArticleForm.tsx`** — Editor component
- Plain `<textarea>` for markdown content, `<input>` for title
- Tag management: add via Enter key, remove via click or Backspace on empty input
- `[[` autocomplete via `useWikiAutocomplete` hook (dropdown with keyboard nav)
- No toolbar, no preview, no keyboard shortcuts for formatting
- Used for both create and edit flows

**`WikiArticleView.tsx`** — Article renderer
- `ReactMarkdown` with `remarkGfm` (tables, task lists, strikethrough) + `rehypeSanitize` (XSS protection)
- `remarkWikiLinks` plugin transforms `[[Title]]` → clickable link to `/wiki/slug`
- Heading IDs generated via `slugify()` for anchor linking
- Custom components for headings, code blocks, tables, blockquotes, images
- Tag display with optional click handler for filtering
- Last updated timestamp

**`WikiArticleList.tsx`** — Article browser
- Client-side search by title (filters locally)
- Tag-based filtering (toggle tag to filter)
- Responsive card grid with article title, tags, and last updated
- Empty state messaging
- Links to `/wiki/[slug]`

**`wiki/[slug]/page.tsx`** — Article detail page
- Fetches article on mount, shows view or edit mode
- Edit mode swaps to `WikiArticleForm` with prefilled data
- Delete with confirmation dialog
- Toast notifications for success/error
- "Back to Wiki" navigation

### 2.3 Hooks & Plugins

**`useWikiAutocomplete`** — `[[` triggered autocomplete
- Detects `[[` in textarea, fetches matching articles from `/api/wiki?search=`
- Shows up to 8 suggestions in positioned dropdown
- Keyboard navigation (arrow keys, Enter/Tab to select, Escape to close)
- Debounced fetch (200ms) with AbortController for race conditions
- Inserts `[[Title]]` on selection

**`remarkWikiLinks`** — Remark plugin
- Regex: `/\[\[([^\]]+)\]\]/g`
- Transforms `[[Title]]` → `/wiki/title` link
- Supports section anchors: `[[Title#Section]]` → `/wiki/title#section`
- Skips code and inline code nodes

### 2.4 API

```
GET    /api/wiki                List articles (query: search, tag)
POST   /api/wiki                Create article (validate with createWikiArticleSchema)
GET    /api/wiki/[slug]         Get article by slug
PATCH  /api/wiki/[slug]         Update article (validate with updateWikiArticleSchema)
DELETE /api/wiki/[slug]         Delete article
```

All endpoints enforce authentication and per-user isolation.

### 2.5 Validation

**`src/lib/validations/wiki.ts`**

`slugify()` — lowercase, strip non-word chars, replace spaces/underscores with hyphens.

```typescript
createWikiArticleSchema: {
  title:   z.string().min(1).max(200),
  slug:    z.string().optional(),          // auto-generated from title
  content: z.string().min(1),
  tags:    z.array(z.string().max(50)).max(20).optional().default([]),
}

updateWikiArticleSchema: {
  // All fields optional, auto-slugifies if title changes
}
```

### 2.6 What's Missing

| Gap | Impact |
|-----|--------|
| No formatting toolbar | Users must know markdown syntax |
| No live preview | Can't see rendered output while editing |
| No table of contents | Long articles are hard to navigate |
| No backlinks | Can't discover "what links to this article?" |
| Search is title-only and client-side | Can't find content, doesn't scale |
| No version history | Edits are destructive, no undo, no audit trail |
| No team sharing | Wiki is personal-only |
| No decision integration | Decisions aren't recorded in the wiki |

Phase 1 addresses the first six gaps. Phases 2 and 3 address the rest.

---

## 3. Phase 1 — Editor UX (Implement Now)

Six features that transform the wiki from a bare textarea into a capable editor. Each feature is self-contained and can be implemented independently.

### 3.1 Markdown Toolbar

A formatting toolbar above the textarea that inserts markdown syntax. For users who don't know markdown, this makes the editor immediately usable. For users who do, the keyboard shortcuts accelerate their workflow.

#### 3.1.1 Hook: `useMarkdownToolbar`

A headless hook that handles all text manipulation logic. The hook operates on a `<textarea>` ref and provides functions to wrap/insert markdown syntax.

```typescript
interface ToolbarAction {
  id: string;
  label: string;
  icon: string;            // lucide icon name
  shortcut?: string;       // "Cmd+B", "Cmd+I", etc.
  action: (textarea: HTMLTextAreaElement) => void;
}

function useMarkdownToolbar(textareaRef: RefObject<HTMLTextAreaElement>) {
  // Returns toolbar actions and keyboard shortcut handler
  return { actions, handleKeyDown };
}
```

**Supported actions:**

| Action | Syntax | Shortcut | Behavior |
|--------|--------|----------|----------|
| Bold | `**text**` | Cmd+B | Wrap selection or insert placeholder |
| Italic | `*text*` | Cmd+I | Wrap selection or insert placeholder |
| Heading 1 | `# ` | — | Prefix line |
| Heading 2 | `## ` | — | Prefix line |
| Heading 3 | `### ` | — | Prefix line |
| Link | `[text](url)` | Cmd+K | Wrap selection as text, cursor on url |
| Bulleted List | `- ` | — | Prefix line |
| Numbered List | `1. ` | — | Prefix line |
| Task List | `- [ ] ` | — | Prefix line |
| Code Inline | `` `code` `` | Cmd+E | Wrap selection |
| Code Block | ` ```\n``` ` | Cmd+Shift+E | Wrap selection in fenced block |
| Quote | `> ` | — | Prefix line |
| Table | Template | — | Insert 2x2 table template |
| Image | `![alt](url)` | — | Insert image syntax |
| Wiki Link | `[[` | Cmd+Shift+L | Insert `[[` and trigger autocomplete |

**Text manipulation strategy:**

```typescript
function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string
): void {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const text = selected || placeholder;
  const newValue = value.slice(0, selectionStart) + before + text + after + value.slice(selectionEnd);

  // Update textarea value and restore cursor position
  textarea.value = newValue;
  textarea.selectionStart = selectionStart + before.length;
  textarea.selectionEnd = selectionStart + before.length + text.length;
  textarea.focus();

  // Trigger React's onChange via input event
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function prefixLine(textarea: HTMLTextAreaElement, prefix: string): void {
  // Find line start, insert prefix
}
```

#### 3.1.2 Component: `MarkdownToolbar`

```
┌──────────────────────────────────────────────────────────────┐
│ B  I  H1 H2 H3 │ 🔗 📷 │ • 1. ☐ │ <> {;} ❝ │ ⊞ 📎 │
└──────────────────────────────────────────────────────────────┘
```

- Built with shadcn `ToggleGroup` + `Tooltip` (show shortcut on hover)
- Icons from `lucide-react`: `Bold`, `Italic`, `Heading1`, `Heading2`, `Heading3`, `Link`, `Image`, `List`, `ListOrdered`, `CheckSquare`, `Code`, `Braces`, `Quote`, `Table`, `FileText`
- Grouped by category with subtle separators
- Responsive: all icons on desktop, overflow menu on mobile
- Wiki Link button opens the existing `[[` autocomplete

#### 3.1.3 Integration with `WikiArticleForm.tsx`

The toolbar sits between the title input and the textarea. No changes to form logic — the toolbar manipulates the textarea value directly and triggers React state updates via synthetic events.

```
┌─────────────────────────────────────────┐
│ Title: [Getting Started with Camping   ]│
│                                         │
│ ┌─ Toolbar ────────────────────────────┐│
│ │ B I H1 H2 H3 │ 🔗 📷 │ • 1. ☐ │...││
│ └──────────────────────────────────────┘│
│ ┌─ Editor ─────────────────────────────┐│
│ │ # Getting Started                    ││
│ │                                      ││
│ │ Here's everything you need to know   ││
│ │ about planning your first camping    ││
│ │ trip. See [[Gear Inventory]] for     ││
│ │ what to bring.                       ││
│ │                                      ││
│ └──────────────────────────────────────┘│
│                                         │
│ Tags: [camping] [getting-started] [+ ] │
│                                         │
│ [Cancel]                     [Save]     │
└─────────────────────────────────────────┘
```

### 3.2 Live Preview

Users can see rendered markdown output while editing. Three modes: Write (textarea only), Preview (rendered only), and Split (side-by-side).

#### 3.2.1 Shared Renderer: `WikiMarkdownRenderer`

Extract the rendering pipeline from `WikiArticleView.tsx` into a shared component that both the preview and the view page use:

```typescript
interface WikiMarkdownRendererProps {
  content: string;
  className?: string;
}

// Encapsulates: ReactMarkdown + remarkGfm + rehypeSanitize + remarkWikiLinks
// + heading slugification + custom components
function WikiMarkdownRenderer({ content, className }: WikiMarkdownRendererProps) {
  // Same rendering logic currently in WikiArticleView.tsx
}
```

This eliminates duplication — `WikiArticleView` delegates to `WikiMarkdownRenderer`, and the preview tab uses it too.

#### 3.2.2 Tab Modes

```
┌─ Write ─┬─ Preview ─┬─ Split ─┐
│██████████│           │         │
└──────────┴───────────┴─────────┘
```

Built with shadcn `Tabs` component.

**Write mode** (default): Toolbar + textarea. Same as current behavior.

**Preview mode**: Rendered markdown using `WikiMarkdownRenderer`. Read-only. Toolbar hidden.

**Split mode**: Textarea on left, rendered preview on right.
- Desktop (≥768px): side-by-side, 50/50 split
- Mobile (<768px): stacked vertically, textarea on top, preview below
- Scroll sync not required (adds complexity, rarely useful for markdown)

#### 3.2.3 Performance

Preview rendering is debounced at 200ms — the preview re-renders 200ms after the user stops typing, not on every keystroke. For articles under ~5,000 words (the vast majority of personal wiki content), this is imperceptible.

```typescript
const debouncedContent = useDebounce(content, 200);

// In split/preview mode:
<WikiMarkdownRenderer content={debouncedContent} />
```

### 3.3 Table of Contents

Long articles need navigation. The TOC parses headings from markdown and displays them as a clickable sidebar, with the current section highlighted as the user scrolls.

#### 3.3.1 Hook: `useTableOfContents`

```typescript
interface TocEntry {
  id: string;      // slugified heading text (matches anchor IDs in rendered output)
  text: string;    // raw heading text
  level: number;   // 1-6
}

function useTableOfContents(content: string): TocEntry[] {
  return useMemo(() => {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const entries: TocEntry[] = [];
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      entries.push({
        id: slugify(match[2]),
        text: match[2],
        level: match[1].length,
      });
    }
    return entries;
  }, [content]);
}
```

#### 3.3.2 Hook: `useActiveHeading`

Tracks which heading is currently in view using IntersectionObserver:

```typescript
function useActiveHeading(headingIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );

    headingIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headingIds]);

  return activeId;
}
```

#### 3.3.3 Component: `WikiTableOfContents`

```
┌─ On This Page ──────────┐
│                          │
│  Getting Started         │  ← h1, active (highlighted)
│    What You Need         │  ← h2, indented
│    Setting Up Camp       │  ← h2
│      Tent Selection      │  ← h3, double indented
│      Fire Safety         │  ← h3
│  Gear Checklist          │  ← h1
│    Essential Items       │  ← h2
│    Nice to Have          │  ← h2
│                          │
└──────────────────────────┘
```

- Appears as a sidebar on the article view page (right side on desktop, collapsible drawer on mobile)
- Active heading highlighted with left border accent + bold text
- Smooth scroll on click: `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })`
- Heading IDs already exist — `WikiArticleView` generates them via `slugify()`
- Only shown when article has 3+ headings (otherwise not useful)
- Sticky positioning so it follows the viewport

#### 3.3.4 Article Page Layout

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Wiki          [Edit] [Delete]             │
│                                                      │
│  ┌─ Article Content ──────────┐  ┌─ On This Page ──┐│
│  │                            │  │                  ││
│  │  # Getting Started         │  │  Getting Started ││
│  │                            │  │    What You Need ││
│  │  Here's everything you     │  │    Setting Up    ││
│  │  need to know about...     │  │  Gear Checklist  ││
│  │                            │  │    Essential     ││
│  │  ## What You Need          │  │    Nice to Have  ││
│  │  ...                       │  │                  ││
│  │                            │  │                  ││
│  └────────────────────────────┘  └──────────────────┘│
│                                                      │
│  ┌─ Backlinks ────────────────────────────────────┐  │
│  │ Referenced by: Camping Trip, Gear Inventory    │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

Desktop: two-column layout with TOC in a sticky sidebar (right).
Mobile: TOC in a collapsible section above the article content.

### 3.4 Backlinks

Backlinks answer the question "what links to this article?" — the reverse of wiki links. This creates a bidirectional knowledge graph without requiring users to maintain links manually.

#### 3.4.1 API: `GET /api/wiki/[slug]/backlinks`

```typescript
// Query: find all articles whose content contains [[This Article's Title]]
const backlinks = await prisma.wikiArticle.findMany({
  where: {
    userId: session.user.id,
    content: {
      contains: `[[${article.title}]]`,
      mode: 'insensitive',
    },
    id: { not: article.id },  // exclude self-references
  },
  select: {
    slug: true,
    title: true,
    updatedAt: true,
  },
  orderBy: { title: 'asc' },
});
```

**Why `ILIKE` is sufficient:** For a personal wiki (even a prolific one with 500+ articles), a case-insensitive substring search on the content column is fast enough. PostgreSQL's `ILIKE` on `Text` columns is O(n) per row, but n is small and the query runs infrequently (once per article page load). No full-text index needed at this scale.

**Edge case — title changes:** When an article's title changes, existing `[[Old Title]]` links in other articles break. Phase 1 does not auto-fix this (too complex for now). The backlinks query uses the current title, so broken links simply won't appear as backlinks. A future "rename refactor" tool could offer to update all references.

#### 3.4.2 Component: `WikiBacklinks`

Displayed at the bottom of the article view page:

```
┌─ Referenced by ─────────────────────────────────────┐
│                                                      │
│  📄 Camping Trip Planning              Updated 2d ago│
│  📄 Summer Gear Inventory              Updated 1w ago│
│  📄 Big Sur Travel Guide               Updated 2w ago│
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Each entry links to the referencing article
- Shows article title and last updated date
- Hidden when there are no backlinks (no empty state needed)
- Fetched on article page load alongside the article itself

### 3.5 Full-Text Content Search

Currently, the wiki search is client-side and title-only. This upgrade moves search server-side and includes article content, so users can find articles by what they contain, not just what they're named.

#### 3.5.1 API Changes: `GET /api/wiki?search=`

Extend the existing search query to include content:

```typescript
// Current (title only):
where: {
  title: { contains: search, mode: 'insensitive' },
}

// Updated (title + content):
where: {
  OR: [
    { title: { contains: search, mode: 'insensitive' } },
    { content: { contains: search, mode: 'insensitive' } },
  ],
}
```

**Response enhancement:** When a search matches content (not title), include a snippet showing the match context:

```typescript
interface WikiSearchResult {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  updatedAt: string;
  snippet?: string;  // ~150 chars around the match, only when content matched
}
```

Snippet extraction:

```typescript
function extractSnippet(content: string, query: string, maxLength = 150): string | null {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  if (index === -1) return null;

  const start = Math.max(0, index - 60);
  const end = Math.min(content.length, index + query.length + 60);
  let snippet = content.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}
```

#### 3.5.2 Component Changes: `WikiArticleList.tsx`

- Replace client-side filtering with server-side search
- Debounced API calls (300ms) as user types
- Display content snippets below article title when present
- Existing tag filtering remains (sent as query param)
- Loading state during search

```
┌─ Wiki ─────────────────────────────────────────────┐
│                                                     │
│  🔍 [camp stove setup                        ]     │
│                                                     │
│  Tags: [camping] [gear] [recipes]                   │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📄 Camping Gear Checklist                     │  │
│  │ ...make sure to bring the camp stove setup    │  │
│  │ instructions and the...                       │  │
│  │ camping · gear         Updated 3 days ago     │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📄 Meal Planning Guide                        │  │
│  │ ...The camp stove setup takes about 10 min... │  │
│  │ camping · recipes      Updated 1 week ago     │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 3.5.3 Future: Full-Text Search with `tsvector`

For wikis that grow beyond ~1,000 articles or where search latency matters, PostgreSQL's built-in full-text search provides a significant upgrade:

```sql
-- Add tsvector column
ALTER TABLE "WikiArticle" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

-- Create GIN index
CREATE INDEX wiki_search_idx ON "WikiArticle" USING gin(search_vector);

-- Query with ranking
SELECT *, ts_rank(search_vector, query) AS rank
FROM "WikiArticle", plainto_tsquery('english', 'camp stove') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

This is documented as a future upgrade path, not a Phase 1 requirement. `ILIKE` is perfectly adequate for personal wiki scale.

### 3.6 Version History

Every edit creates a snapshot of the previous state, enabling undo, comparison, and audit trail. This follows the same event-sourcing philosophy as `TaskEvent` and `ProjectEvent` in the existing codebase.

#### 3.6.1 Data Model

```prisma
model WikiArticleVersion {
  id        String   @id @default(cuid())
  version   Int
  title     String
  content   String   @db.Text
  tags      String[]
  message   String?  // optional edit summary ("Updated gear list for summer")
  createdAt DateTime @default(now())

  articleId String
  article   WikiArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)

  @@index([articleId])
  @@unique([articleId, version])
}
```

Add to `WikiArticle`:

```prisma
model WikiArticle {
  // ... existing fields ...
  versions WikiArticleVersion[]
}
```

**Version numbering:** Sequential integers per article, starting at 1. Each save increments the version number. The current article content is always the "latest" — versions store the previous state.

**Storage strategy:** Each version stores the full content (not diffs). For personal wikis, articles are typically 1-20 KB. Even 100 versions of a 20 KB article is only 2 MB — negligible. Full snapshots make retrieval and revert trivial, unlike diff-based systems that require reconstruction.

#### 3.6.2 Version Creation Flow

When `PATCH /api/wiki/[slug]` is called:

```typescript
// 1. Load current article
const current = await prisma.wikiArticle.findUnique({ where: { userId_slug } });

// 2. Determine next version number
const lastVersion = await prisma.wikiArticleVersion.findFirst({
  where: { articleId: current.id },
  orderBy: { version: 'desc' },
  select: { version: true },
});
const nextVersion = (lastVersion?.version ?? 0) + 1;

// 3. Snapshot current state BEFORE applying update
await prisma.wikiArticleVersion.create({
  data: {
    articleId: current.id,
    version: nextVersion,
    title: current.title,
    content: current.content,
    tags: current.tags,
    message: body.message,  // optional edit summary from the request
  },
});

// 4. Apply the update to the article
const updated = await prisma.wikiArticle.update({ ... });
```

The message field is optional — users can add an edit summary like a git commit message, but it's not required. The version is created regardless.

#### 3.6.3 API Surface

```
GET  /api/wiki/[slug]/history              List versions (newest first)
GET  /api/wiki/[slug]/history/[versionId]  Get specific version detail
POST /api/wiki/[slug]/history/[versionId]/revert  Restore a previous version
```

**List versions:**

```typescript
// Response
{
  versions: [
    { id, version, title, message, createdAt },
    { id, version, title, message, createdAt },
    ...
  ]
}
```

**Get version detail:** Returns the full version including content (for viewing or diffing).

**Revert:** Creates a new version (snapshot of current state) then overwrites the article with the target version's content. This means reverting is non-destructive — you can always revert the revert.

```typescript
// POST /api/wiki/[slug]/history/[versionId]/revert

// 1. Snapshot current state (same as normal edit)
// 2. Load target version
// 3. Update article with target version's title, content, tags
// 4. Return updated article
```

#### 3.6.4 Validation Changes

Add optional `message` field to `updateWikiArticleSchema`:

```typescript
updateWikiArticleSchema: {
  title:   z.string().min(1).max(200).optional(),
  slug:    z.string().optional(),
  content: z.string().min(1).optional(),
  tags:    z.array(z.string().max(50)).max(20).optional(),
  message: z.string().max(500).optional(),  // NEW: edit summary
}
```

#### 3.6.5 Component: `WikiVersionHistory`

Accessed via a "History" button on the article view page. Shows a timeline of versions:

```
┌─ Version History ────────────────────────────────────┐
│                                                       │
│  📄 Current version                                   │
│     Last edited February 22, 2026 at 3:45 PM         │
│                                                       │
│  ─────────────────────────────────────────────────── │
│                                                       │
│  v3 · February 22, 2026 at 2:30 PM                   │
│     "Updated gear list for summer trip"               │
│     [View] [Compare] [Restore]                        │
│                                                       │
│  v2 · February 21, 2026 at 10:15 AM                  │
│     "Added campfire cooking section"                  │
│     [View] [Compare] [Restore]                        │
│                                                       │
│  v1 · February 20, 2026 at 4:00 PM                   │
│     (initial version)                                 │
│     [View] [Compare] [Restore]                        │
│                                                       │
└───────────────────────────────────────────────────────┘
```

- **View:** Opens a read-only rendering of that version's content
- **Compare:** Shows diff between that version and current
- **Restore:** Reverts article to that version (with confirmation dialog)

#### 3.6.6 Component: `WikiDiffView`

A simple line-based diff display for comparing versions. No heavy diff library needed — a lightweight implementation covers the use case.

```typescript
interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber?: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  // Simple line-by-line comparison using longest common subsequence
  // Green background for additions, red for removals, no background for unchanged
}
```

```
┌─ Changes: v2 → Current ─────────────────────────────┐
│                                                       │
│    ## Gear Checklist                                  │
│                                                       │
│ -  - Tent (4-person)                                  │
│ +  - Tent (6-person, upgraded for the group)          │
│    - Sleeping bags                                    │
│    - Camp stove                                       │
│ +  - Extra propane canisters                          │
│ +  - Firewood (check if campground sells it)          │
│    - Cooler with ice                                  │
│                                                       │
└───────────────────────────────────────────────────────┘
```

Removed lines shown with red background, added lines with green. Unchanged context lines shown for surrounding context. This is sufficient for personal wiki versioning — users need to see what changed, not perform merge conflict resolution.

---

## 4. Phase 2 — Team Collaboration (Document Only, Implement Later)

**Implements with:** TEAMS.md, TEAMS_HIERARCHICAL.md

When Teams ship, the wiki extends from personal knowledge to shared knowledge. This section documents the design — implementation happens alongside the Teams feature set.

### 4.1 Team Wiki Namespaces

Articles gain an optional `teamId`, creating separate namespaces:

```prisma
model WikiArticle {
  // ... existing fields ...

  teamId  String?  @map("team_id")
  team    Team?    @relation(fields: [teamId], references: [id], onDelete: SetNull)

  // Slug uniqueness becomes: unique per (userId OR teamId)
  @@unique([userId, slug])     // personal articles
  @@unique([teamId, slug])     // team articles (new)
}
```

- **Personal articles** (`teamId` null): Only visible to the owner. Same as today.
- **Team articles** (`teamId` set): Visible to all team members. Follows the same visibility rules as team projects (see TEAMS.md §1.3).

The wiki article list and search respect the current scope — personal wiki shows personal articles, team dashboard shows team articles, and a unified search can span both.

### 4.2 Article Permissions

```prisma
model WikiArticlePermission {
  id        String   @id @default(cuid())
  articleId String   @map("article_id")
  article   WikiArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)

  // Either team-wide or per-user permission
  teamId    String?  @map("team_id")
  team      Team?    @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId    String?  @map("user_id")
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  role      WikiArticleRole @default(VIEWER)

  @@unique([articleId, teamId])
  @@unique([articleId, userId])
}

enum WikiArticleRole {
  VIEWER   // Can read the article
  EDITOR   // Can read and edit
  ADMIN    // Can read, edit, and manage permissions
}
```

Default: all team members get EDITOR on team wiki articles (wiki is collaborative by default). Permissions can be narrowed for sensitive articles (e.g., budget planning docs where only admins can edit).

### 4.3 Conflict Detection

When multiple people can edit the same article, conflicts are inevitable. Phase 2 uses **optimistic conflict detection** — not real-time collaboration, but a warning when someone else edited since you loaded the page.

```typescript
// On article load, capture the updatedAt timestamp
const loadedAt = article.updatedAt;

// On save, check if article was modified since load
const current = await prisma.wikiArticle.findUnique({ where: { id } });
if (current.updatedAt > loadedAt) {
  return Response.json({
    error: 'CONFLICT',
    message: 'This article was edited by someone else since you started editing.',
    lastEditedBy: current.lastEditedBy,
    lastEditedAt: current.updatedAt,
  }, { status: 409 });
}
```

The UI shows a conflict dialog with options:
- **Overwrite:** Save your version (their changes go to version history)
- **Discard:** Reload the latest version and lose your edits
- **Copy:** Copy your content to clipboard, then reload the latest version

### 4.4 Real-Time Presence

Lightweight presence indicators showing who's currently viewing or editing an article:

```
┌─ Camping Gear Checklist ─────────────────────────────┐
│                                         👤 Mike (viewing) │
│                                         ✏️ Sarah (editing) │
│  ...                                                  │
```

Implementation via server-sent events (SSE) or periodic polling. Presence is informational — it doesn't lock the article or prevent concurrent edits. The conflict detection (§4.3) handles the actual conflict case.

### 4.5 Article Locking (Soft Lock)

Optional soft lock for when a team wants exclusive editing:

- When a user starts editing, a soft lock is acquired (stored in DB with a timeout)
- Other users see "Sarah is editing this article" and can choose to wait or force-edit
- Soft lock auto-expires after 30 minutes of inactivity (heartbeat-based)
- Any team admin can break a lock

This is opt-in per team — most small teams won't need it.

### 4.6 Team-Scoped Search and Tags

- Wiki search respects scope: personal search returns personal articles, team search returns team articles
- Tags are scoped per namespace — "camping" in personal wiki is independent of "camping" in team wiki
- A unified search mode (for "What Should I Do Now?" style cross-scope views) searches across all accessible articles

### 4.7 Activity Feed

Team wiki gets an activity feed showing recent changes:

```
Recent Wiki Activity (Camping Crew)
├── Sarah edited "Gear Checklist" — 2 hours ago
├── Mike created "Meal Planning Guide" — yesterday
├── Jason edited "Campsite Research" — 2 days ago
└── Sarah edited "Packing List" — 3 days ago
```

This reuses the `WikiArticleVersion` data from Phase 1 — each version entry is an activity event.

---

## 5. Phase 3 — Decision Integration (Document Only, Implement Later)

**Implements with:** DECISION_PROPOSALS.md §8

When Decision Proposals ship, the wiki becomes the permanent record of team decisions. This closes the loop: decisions are made in the proposal workflow and recorded in the wiki for long-term reference.

### 5.1 Auto-Create/Update Wiki Articles on Decision Resolution

When a decision proposal is resolved (status → DECIDED), the system automatically updates the linked wiki article:

```typescript
// On decision resolution:
if (proposal.wikiArticleId) {
  // Append decision record to existing article
  const article = await prisma.wikiArticle.findUnique({ where: { id: proposal.wikiArticleId } });
  const decisionBlock = generateDecisionMarkdown(proposal);

  if (proposal.wikiSection) {
    // Insert after the specified heading
    article.content = insertAfterHeading(article.content, proposal.wikiSection, decisionBlock);
  } else {
    // Append to end
    article.content += '\n\n' + decisionBlock;
  }

  await prisma.wikiArticle.update({ where: { id: article.id }, data: { content: article.content } });
}
```

Generated markdown:

```markdown
**Decision: Kirk Creek, Big Sur** ✅
*Decided February 26, 2026 by Jason · [View full proposal →](/decisions/clu1234)*

Kirk Creek won the group vote 3-2-1 over Upper Pines and Steep Ravine.
Key factors: availability confirmed, budget fits at $35/night × 2 sites,
drive time 2h45m from SF.
```

### 5.2 Decision Archive Pages

Teams can maintain a "Decisions Log" wiki article that auto-accumulates all resolved decisions:

```markdown
# Camping Crew — Decisions Log

## 2026

### Campsite Selection — Decided Feb 26
**Outcome:** Kirk Creek, Big Sur, March 20-22
**Owner:** Jason · **Votes:** 6 · [Full proposal →](/decisions/clu1234)

### Shared Gear — Decided Feb 20
**Outcome:** Jason brings tent & stove, Mike brings cooler & chairs
**Owner:** Mike · **Approvals:** 5/6 · [Full proposal →](/decisions/clu5678)
```

This article is auto-maintained — each resolved decision appends a new entry. The article can also be manually edited for additional context.

### 5.3 Bi-Directional Linking

- **Decision → Wiki:** Each proposal can link to a wiki article and section (already in DECISION_PROPOSALS.md §4.1: `wikiArticleId`, `wikiSection`)
- **Wiki → Decision:** Wiki articles display linked decisions in a sidebar or footer section
- `[[Decision: Campsite Selection]]` syntax in wiki content links to the proposal detail view

### 5.4 Decision Outcome Summaries

When a decision is resolved and linked to a wiki article, the outcome summary is inserted as a callout block:

```markdown
> **✅ Decision: Campsite Selection** (Feb 26, 2026)
> Kirk Creek, Big Sur — March 20-22, 2026
> [View full proposal →](/decisions/clu1234)
```

This renders as a visually distinct block in the wiki article, making decisions scannable within larger documents.

---

## 6. Future Roadmap — Rich Editor (Aspirational)

The current approach (markdown textarea + toolbar + preview) serves the personal wiki and small team use case well. A rich editor is an aspirational future upgrade for when Tandem targets larger teams or users who prefer WYSIWYG editing.

### 6.1 Tiptap (ProseMirror-Based)

[Tiptap](https://tiptap.dev/) is the leading ProseMirror wrapper for React. It provides:

- WYSIWYG editing with markdown import/export
- Extensible node/mark system for custom content types
- Slash commands (`/heading`, `/table`, `/wiki-link`, `/code-block`)
- Drag-and-drop block reordering
- Toolbar integration via headless UI hooks
- Collaborative editing via Yjs integration

### 6.2 Slash Commands

```
Type / to insert...
├── /heading     → Insert heading (1-3)
├── /table       → Insert table
├── /code        → Insert code block
├── /image       → Insert image
├── /wiki-link   → Search and insert [[wiki link]]
├── /task-list   → Insert checklist
├── /quote       → Insert blockquote
├── /divider     → Insert horizontal rule
└── /decision    → Embed decision proposal status
```

### 6.3 Collaborative Real-Time Editing

For teams that need Google Docs-style co-editing:

- **Yjs** for CRDT-based conflict-free collaboration
- **Hocuspocus** as the WebSocket sync server
- Cursor presence (see where each collaborator is typing)
- Automatic conflict resolution (no merge conflicts)

This replaces the Phase 2 conflict detection (§4.3) with true real-time collaboration. It's a significant engineering investment and only warranted at scale.

### 6.4 Migration Path

Moving from markdown textarea to Tiptap is non-breaking:
- Tiptap reads/writes markdown via `@tiptap/extension-markdown`
- Existing articles (stored as markdown) load directly into the rich editor
- Users who prefer raw markdown can toggle between rich and source modes
- The toolbar actions from Phase 1 (§3.1) map directly to Tiptap commands

**This is documented as aspirational, not planned.** The markdown editor with toolbar and preview covers the Tandem use case for the foreseeable future.

---

## 7. Data Model Changes Summary (Phase 1)

### 7.1 New Model: `WikiArticleVersion`

```prisma
model WikiArticleVersion {
  id        String   @id @default(cuid())
  version   Int
  title     String
  content   String   @db.Text
  tags      String[]
  message   String?  // optional edit summary
  createdAt DateTime @default(now())

  articleId String
  article   WikiArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)

  @@index([articleId])
  @@unique([articleId, version])
}
```

### 7.2 Modified Model: `WikiArticle`

Add relation to versions:

```prisma
model WikiArticle {
  // ... all existing fields unchanged ...

  versions WikiArticleVersion[]
}
```

### 7.3 Validation: `updateWikiArticleSchema`

Add optional `message` field:

```typescript
message: z.string().max(500).optional()
```

---

## 8. Implementation Checklist (Phase 1)

Ordered by dependency — earlier items unblock later ones.

### 8.1 Foundation

- [ ] Add `WikiArticleVersion` model to `prisma/schema.prisma`
- [ ] Add `versions` relation to `WikiArticle` model
- [ ] Run `npx prisma migrate dev`
- [ ] Add `message` field to `updateWikiArticleSchema` in `src/lib/validations/wiki.ts`

### 8.2 Shared Renderer

- [ ] Extract `WikiMarkdownRenderer` from `WikiArticleView.tsx` → `src/components/wiki/WikiMarkdownRenderer.tsx`
- [ ] Update `WikiArticleView.tsx` to use `WikiMarkdownRenderer`

### 8.3 Markdown Toolbar

- [ ] Create `src/lib/hooks/use-markdown-toolbar.ts`
- [ ] Create `src/components/wiki/MarkdownToolbar.tsx`
- [ ] Integrate toolbar into `WikiArticleForm.tsx`

### 8.4 Live Preview

- [ ] Add Write/Preview/Split tabs to `WikiArticleForm.tsx`
- [ ] Preview and Split modes use `WikiMarkdownRenderer`
- [ ] Debounced rendering (200ms) for performance

### 8.5 Table of Contents

- [ ] Create `src/lib/hooks/use-table-of-contents.ts`
- [ ] Create `src/lib/hooks/use-active-heading.ts`
- [ ] Create `src/components/wiki/WikiTableOfContents.tsx`
- [ ] Add TOC sidebar to `src/app/(dashboard)/wiki/[slug]/page.tsx`

### 8.6 Backlinks

- [ ] Create `src/app/api/wiki/[slug]/backlinks/route.ts`
- [ ] Create `src/components/wiki/WikiBacklinks.tsx`
- [ ] Add backlinks section to article view page

### 8.7 Full-Text Content Search

- [ ] Update `GET /api/wiki` to search content in addition to title
- [ ] Add snippet extraction for content matches
- [ ] Update `WikiArticleList.tsx` to use server-side search with debouncing

### 8.8 Version History

- [ ] Update `PATCH /api/wiki/[slug]` to create version before updating
- [ ] Create `src/app/api/wiki/[slug]/history/route.ts` (list versions)
- [ ] Create `src/app/api/wiki/[slug]/history/[versionId]/route.ts` (version detail)
- [ ] Create `src/app/api/wiki/[slug]/history/[versionId]/revert/route.ts` (restore)
- [ ] Create `src/components/wiki/WikiVersionHistory.tsx`
- [ ] Create `src/components/wiki/WikiDiffView.tsx`
- [ ] Add "History" button to article view page

---

## 9. Key Files Reference

| File | Role |
|------|------|
| `src/components/wiki/WikiArticleForm.tsx` | Editor — gains toolbar + preview tabs |
| `src/components/wiki/WikiArticleView.tsx` | Renderer — extract shared `WikiMarkdownRenderer` |
| `src/components/wiki/WikiArticleList.tsx` | List view — upgrade to server-side content search |
| `src/app/(dashboard)/wiki/[slug]/page.tsx` | Article page — gains TOC sidebar, backlinks, history |
| `src/app/api/wiki/route.ts` | List/create API — add content search + snippets |
| `src/app/api/wiki/[slug]/route.ts` | Update API — add version creation on save |
| `src/lib/hooks/use-wiki-autocomplete.ts` | `[[` autocomplete — reuse in toolbar wiki-link action |
| `src/lib/remark-wiki-links.ts` | Wiki link Remark plugin — unchanged |
| `src/lib/validations/wiki.ts` | Zod schemas — add `message` field |
| `prisma/schema.prisma` | Add `WikiArticleVersion` model |
| `docs/specs/DECISION_PROPOSALS.md` | Cross-referenced for Phase 3 (§8 wiki integration) |
| `docs/specs/TEAMS.md` | Cross-referenced for Phase 2 (team ownership) |
| `docs/specs/TEAMS_HIERARCHICAL.md` | Cross-referenced for Phase 2 (team hierarchy) |
