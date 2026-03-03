# Help Docs — Admin-Authored, Seed-on-Deploy Knowledge Base

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Tandem is a self-hosted app with features that require setup guidance — MCP connections, OAuth configuration, AI settings, Cloudflare WAF rules. Right now, that knowledge lives in Jason's head and in scattered session notes. Users who install Tandem have no way to discover how features work or how to configure them.

### What We Want

A built-in help system where:

1. **Help articles ship with the build** — markdown files in the repo, seeded into the DB on deploy. New installations get the latest docs automatically. Updates arrive with code updates.
2. **Admin can edit and extend** — the admin can tweak seeded articles or create new ones via the UI. Custom articles survive deploys. Seeded articles update from the repo when the source file changes.
3. **All users see help docs read-only** — no team membership required, no special access. If you're logged in, you can read help.
4. **Content matches the build** — because docs are in the same repo as the code, they stay in sync. When a feature ships, its help article ships with it. When a feature changes, the docs update in the same PR.
5. **Categories + tags** — structured navigation via categories (sidebar sections), plus tags for cross-cutting filtering.

### Why Not Extend the Wiki?

The personal wiki is per-user, private by default, and designed for individual knowledge management. Help docs are global, read-only for users, admin-authored, and seed-from-files. Bolting these behaviors onto `WikiArticle` via a scope flag would require conditionals everywhere — visibility checks, edit permissions, slug uniqueness rules, API auth. A dedicated `HelpArticle` model is cleaner and uses the same rendering components (markdown renderer, TOC, search) without entangling the data model.

When Teams ship and team wikis become a thing, those will be a third category — team-scoped, team-editable. Each scope (personal wiki, team wiki, help docs) has distinct ownership and visibility rules that deserve their own model.

---

## 2. Content Authoring Flow

### 2.1 Source Files in Repo

Help articles live as markdown files with YAML frontmatter:

```
docs/help/
  getting-started/
    welcome.md
    inbox-processing.md
    weekly-review.md
  features/
    ai-chat.md
    mcp-setup-claude-ai.md
    mcp-setup-claude-desktop.md
    horizons-of-focus.md
    recurring-tasks.md
  admin/
    server-settings.md
    user-management.md
    ai-configuration.md
  troubleshooting/
    cloudflare-ai-bots.md
    oauth-errors.md
```

### 2.2 Frontmatter Format

```yaml
---
title: Setting Up MCP with Claude.ai
slug: mcp-setup-claude-ai
category: Features
tags: [mcp, ai, claude, setup]
sortOrder: 10
adminOnly: false
---

# Setting Up MCP with Claude.ai

Tandem can connect to Claude.ai as an MCP server, letting you manage
your GTD system from Claude's chat interface...
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display title |
| `slug` | No | URL slug. Auto-generated from filename if omitted (`mcp-setup-claude-ai`) |
| `category` | Yes | Primary grouping. Maps to sidebar sections. |
| `tags` | No | Array of tags for cross-cutting filtering |
| `sortOrder` | No | Sort position within category (default: 0, then alphabetical) |
| `adminOnly` | No | If true, only visible to server admins (default: false) |

### 2.3 Folder-to-Category Convention

The directory name under `docs/help/` becomes the default category if `category` isn't specified in frontmatter. Directory names are title-cased: `getting-started/` → "Getting Started".

Explicit `category` in frontmatter always wins, so you can put a file in any folder and override its category.

### 2.4 Example Article

```markdown
---
title: Setting Up MCP with Claude.ai
category: Features
tags: [mcp, ai, claude]
sortOrder: 10
---

# Setting Up MCP with Claude.ai

Tandem can act as an MCP server for Claude.ai, giving Claude direct
access to your tasks, projects, and inbox.

## Prerequisites

- Tandem server accessible via HTTPS (not localhost)
- Admin access to configure AI settings
- A Claude.ai Pro or Team account

## Step 1: Enable MCP Server

Go to **Admin Settings → AI Configuration** and ensure:

- **Master AI Toggle** is ON
- **MCP Server** is ON
- **Allow users to connect MCP clients** is ON

## Step 2: Configure Cloudflare (if applicable)

If your server is behind Cloudflare with "Block AI bots" enabled,
Claude.ai's backend requests will be blocked with a 403.

Create a WAF custom rule:

- **Field:** User Agent
- **Operator:** contains
- **Value:** `Claude-User`
- **AND**
- **Field:** URI Path
- **Operator:** equals
- **Value:** `/api/mcp`
- **Action:** Skip all managed rules

## Step 3: Connect from Claude.ai

1. In Claude.ai, go to **Settings → Integrations → Add MCP Server**
2. Enter your server URL: `https://your-tandem.example.com/api/mcp`
3. Claude.ai will redirect you to Tandem's OAuth consent page
4. Click **Allow** to authorize the connection
5. You should see Tandem's tools available in Claude.ai

## Troubleshooting

### "McpAuthorizationError: Your account was authorized but the integration rejected the credentials"

This usually means Cloudflare is blocking Claude.ai's backend requests.
Check Step 2 above.

### OAuth consent page doesn't load

Make sure your server has a valid SSL certificate and is accessible
from the public internet.

## Related

- [[AI Configuration]]
- [[MCP with Claude Desktop]]
```

---

## 3. Data Model

### 3.1 HelpArticle

```prisma
model HelpArticle {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  content     String   @db.Text
  category    String                    // "Getting Started", "Features", etc.
  tags        String[]
  sortOrder   Int      @default(0)
  adminOnly   Boolean  @default(false)  // Only visible to server admins
  isPublished Boolean  @default(true)   // Draft support

  // Seed tracking
  sourceFile  String?  @unique          // "getting-started/welcome.md" — null = created via UI
  sourceHash  String?                   // SHA-256 of file content at last seed

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Last editor (for admin UI edits)
  lastEditedById String?
  lastEditedBy   User?   @relation("HelpArticleEdits", fields: [lastEditedById], references: [id])

  @@index([category])
}
```

Key design choices:

- **`slug` is globally unique** — not per-user like wiki articles
- **No `userId`** — help articles belong to the server, not a user
- **`sourceFile`** — the relative path under `docs/help/` that seeded this article. `null` means admin created it via the UI. Unique constraint prevents duplicate seeding.
- **`sourceHash`** — SHA-256 hash of the source file's content at last seed. Used to detect whether the file changed since last deploy.
- **`adminOnly`** — for articles like "Server Settings" that are only relevant to admins

### 3.2 HelpCategory (Optional — Start Without)

Categories can start as just strings on `HelpArticle.category`. If we later need category metadata (icon, description, custom sort order), add:

```prisma
model HelpCategory {
  id          String @id @default(cuid())
  name        String @unique           // "Getting Started"
  slug        String @unique           // "getting-started"
  icon        String?                  // Lucide icon name
  description String?
  sortOrder   Int    @default(0)
}
```

For now, derive category list from the distinct `category` values on `HelpArticle`. Add the model later if needed.

---

## 4. Seed Mechanism

### 4.1 Seed Script

A script that reads all markdown files under `docs/help/` and upserts them into the database:

```typescript
// prisma/seed-help.ts (or src/lib/seed-help.ts)

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { createHash } from "crypto";
import matter from "gray-matter";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const HELP_DIR = join(process.cwd(), "docs/help");

async function seedHelp() {
  const files = await getMarkdownFiles(HELP_DIR);
  let created = 0, updated = 0, unchanged = 0;

  for (const filePath of files) {
    const raw = await readFile(filePath, "utf-8");
    const { data: frontmatter, content } = matter(raw);
    const sourceFile = relative(HELP_DIR, filePath);
    const sourceHash = createHash("sha256").update(raw).digest("hex");

    // Derive slug from frontmatter or filename
    const slug = frontmatter.slug || slugify(sourceFile.replace(/\.md$/, ""));

    // Derive category from frontmatter or parent directory
    const dirName = sourceFile.split("/")[0];
    const category = frontmatter.category || titleCase(dirName);

    const existing = await prisma.helpArticle.findUnique({
      where: { sourceFile },
    });

    if (!existing) {
      // New article — create
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
    } else if (existing.sourceHash !== sourceHash) {
      // File changed since last seed — update
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
    } else {
      // File unchanged — skip
      unchanged++;
    }
  }

  console.log(`Help articles seeded: ${created} created, ${updated} updated, ${unchanged} unchanged`);
}
```

### 4.2 When Seeding Runs

Three options, all compatible:

| Trigger | How | When |
|---------|-----|------|
| **Prisma seed** | Add to `prisma/seed.ts` or `package.json` seed script | `npx prisma db seed`, `npx prisma migrate reset` |
| **Build step** | Add to `npm run build` as a post-build script | Every deploy |
| **App startup** | Call from a server-side initialization module | Every cold start |

**Recommended: Prisma seed + build step.** The seed script is idempotent (upsert by `sourceFile`), so running it multiple times is safe.

```json
// package.json
{
  "prisma": {
    "seed": "tsx prisma/seed-help.ts"
  },
  "scripts": {
    "build": "next build && tsx prisma/seed-help.ts",
    "seed:help": "tsx prisma/seed-help.ts"
  }
}
```

### 4.3 Admin Edit Behavior

When an admin edits a seeded article via the UI:
- `content` is updated, `sourceHash` stays the same
- On next deploy, if the source file changed (`sourceHash` differs), the DB is updated from the file — **admin's UI edits are overwritten**
- If the source file didn't change, the admin's edits are preserved
- This is the right behavior: the repo is the source of truth. Admin edits are temporary overrides between deploys. For permanent changes, edit the file in the repo.

### 4.4 Admin-Created Articles

Articles created by the admin through the UI have `sourceFile = null`. They are never touched by the seed script. They survive all deployments. The admin owns them entirely.

---

## 5. API Routes

### 5.1 Public (All Authenticated Users)

**`GET /api/help`** — list articles
- Query params: `category`, `tag`, `search`
- Returns: articles sorted by category sortOrder, then article sortOrder
- Filters out `adminOnly` articles unless the current user is a server admin
- Response includes distinct categories for sidebar rendering

```typescript
// Response shape
{
  articles: [
    {
      id, slug, title, category, tags, sortOrder,
      updatedAt, snippet?  // snippet only when search is active
    }
  ],
  categories: [
    { name: "Getting Started", count: 3 },
    { name: "Features", count: 5 },
    { name: "Admin", count: 3 },
    { name: "Troubleshooting", count: 2 },
  ]
}
```

**`GET /api/help/[slug]`** — get article
- Returns full article content
- 404 if not found or `adminOnly` and user is not admin

**`GET /api/help/[slug]/backlinks`** — find articles that link to this one
- Same `[[wikilink]]` pattern as personal wiki
- Searches across help articles only (not personal wiki)

### 5.2 Admin Only

**`POST /api/help`** — create article
- Requires server admin role
- Body: `{ title, slug?, content, category, tags?, sortOrder?, adminOnly? }`
- Creates with `sourceFile = null` (admin-created)

**`PATCH /api/help/[slug]`** — update article
- Requires server admin role
- Body: `{ title?, content?, category?, tags?, sortOrder?, adminOnly?, isPublished? }`
- Sets `lastEditedById` to the current admin user

**`DELETE /api/help/[slug]`** — delete article
- Requires server admin role
- For seeded articles: consider soft-delete (set `isPublished = false`) so it doesn't get re-created on next seed. Or add `sourceFile` to an ignore list.

### 5.3 Validation

```typescript
// src/lib/validations/help.ts

export const createHelpArticleSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(200).optional(),
  content: z.string().min(1),
  category: z.string().min(1).max(100),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  sortOrder: z.number().int().optional().default(0),
  adminOnly: z.boolean().optional().default(false),
});

export const updateHelpArticleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z.string().min(1).max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  sortOrder: z.number().int().optional(),
  adminOnly: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});
```

---

## 6. UI

### 6.1 Help Page (`/help`)

Two-panel layout: category sidebar + article content.

```
┌──────────────────────────────────────────────────────────────┐
│  Help & Documentation                    🔍 [Search help...] │
├────────────────────┬─────────────────────────────────────────┤
│                    │                                         │
│  Getting Started   │  # Setting Up MCP with Claude.ai       │
│    Welcome         │                                         │
│    Inbox Processing│  Tandem can act as an MCP server for    │
│    Weekly Review   │  Claude.ai, giving Claude direct access │
│                    │  to your tasks, projects, and inbox.    │
│  Features          │                                         │
│    AI Chat         │  ## Prerequisites                       │
│  ▸ MCP Setup ◂     │                                         │
│    Horizons        │  - Tandem server accessible via HTTPS   │
│    Recurring Tasks │  - Admin access to configure AI         │
│                    │  - Claude.ai Pro or Team account        │
│  Admin             │                                         │
│    Server Settings │  ## Step 1: Enable MCP Server           │
│    User Management │                                         │
│    AI Config       │  Go to Admin Settings → AI Config...    │
│                    │                                         │
│  Troubleshooting   │  ## Step 2: Configure Cloudflare        │
│    Cloudflare Bots │                                         │
│    OAuth Errors    │  ...                                    │
│                    │                                         │
│                    │  ─────────────────────────────────────  │
│                    │  Tags: mcp · ai · claude · setup        │
│                    │  Last updated: Feb 23, 2026             │
│                    │                                         │
│                    │  Related:                               │
│                    │  ← AI Configuration                     │
│                    │  ← MCP with Claude Desktop              │
│                    │                                         │
└────────────────────┴─────────────────────────────────────────┘
```

**Sidebar:**
- Categories listed in sort order, then alphabetical
- Articles within each category listed in sortOrder, then alphabetical
- Active article highlighted
- Admin-only category ("Admin") only visible to admins
- Collapsible categories on mobile

**Article view:**
- Uses the same `WikiMarkdownRenderer` component as the personal wiki
- `[[wikilinks]]` resolve within help articles (link to `/help/slug` not `/wiki/slug`)
- Table of contents sidebar for long articles (same `useTableOfContents` hook)
- Tags displayed below content
- "Related" section shows backlinks (other help articles that link to this one)

**Admin extras:**
- "Edit" button in the top right when viewing any article
- "New Article" button at the top of the sidebar
- Small badge on seeded articles: "Synced from repo" or "Custom"
- Clicking edit opens an inline editor (same markdown textarea + toolbar as wiki)

### 6.2 Help Index (`/help` with no article selected)

When no article is selected, show a landing page:

```
┌──────────────────────────────────────────────────────────────┐
│  Help & Documentation                    🔍 [Search help...] │
├────────────────────┬─────────────────────────────────────────┤
│                    │                                         │
│  Categories...     │  Welcome to Tandem Help                 │
│                    │                                         │
│                    │  ┌──────────────┐ ┌──────────────┐      │
│                    │  │ 🚀           │ │ ⚡           │      │
│                    │  │ Getting      │ │ Features     │      │
│                    │  │ Started      │ │              │      │
│                    │  │ 3 articles   │ │ 5 articles   │      │
│                    │  └──────────────┘ └──────────────┘      │
│                    │  ┌──────────────┐ ┌──────────────┐      │
│                    │  │ 🔧           │ │ ❓           │      │
│                    │  │ Admin        │ │ Trouble-     │      │
│                    │  │              │ │ shooting     │      │
│                    │  │ 3 articles   │ │ 2 articles   │      │
│                    │  └──────────────┘ └──────────────┘      │
│                    │                                         │
└────────────────────┴─────────────────────────────────────────┘
```

### 6.3 Search

Server-side search across title + content (same approach as wiki search spec):

- Debounced input (300ms)
- Searches title and content
- Returns snippets for content matches
- Results grouped by category
- Replaces the sidebar category list with search results while searching

### 6.4 Navigation Entry Point

Add "Help" to the sidebar navigation:

```
┌──────────────────────────────┐
│  ...                         │
│  📝 Weekly Review            │
│  📖 Wiki                     │
│  ❓ Help                     │  ← NEW
│                              │
│  ─── Horizons ────────────   │
│  ...                         │
└──────────────────────────────┘
```

### 6.5 Wikilinks Between Help Articles

The existing `remarkWikiLinks` plugin transforms `[[Title]]` → links. For help articles, the resolver needs to:

1. Look up the title among help articles (not personal wiki)
2. Generate `/help/slug` URLs (not `/wiki/slug`)

This can be a prop on the renderer: `linkBase="/help"` vs `linkBase="/wiki"`. Or a separate remark plugin instance configured for help article resolution.

The simplest approach: the help article renderer uses a modified `remarkWikiLinks` that resolves `[[Title]]` → `/help/{slugify(title)}`. Since help article slugs are globally unique (not per-user), this works without a DB lookup at render time. If the target article doesn't exist, the link renders as plain text or a "create this article" prompt for admins.

---

## 7. Components

### 7.1 Component Hierarchy

```
src/components/help/
  HelpSidebar.tsx          — Category navigation + article list
  HelpArticleView.tsx      — Article renderer (uses WikiMarkdownRenderer)
  HelpArticleEditor.tsx    — Admin edit form (uses WikiArticleForm patterns)
  HelpSearch.tsx           — Search input + results
  HelpCategoryCards.tsx    — Landing page category cards
```

### 7.2 Page Routes

```
src/app/(dashboard)/help/
  page.tsx                 — Help index (category cards or first article)
  [slug]/
    page.tsx               — Article view (with admin edit toggle)
```

### 7.3 Shared Components (Reused from Wiki)

These existing wiki components are used directly by help docs:

| Component | Used For |
|-----------|----------|
| `WikiMarkdownRenderer` | Rendering article markdown content |
| `WikiTableOfContents` | TOC sidebar for long articles |
| `useTableOfContents` | Parsing headings from markdown |
| `useActiveHeading` | Highlighting current section in TOC |
| `MarkdownToolbar` | Admin edit mode (when wiki Phase 1 ships) |

If these haven't been extracted from `WikiArticleView` yet (wiki Phase 1), the help docs implementation should do that extraction as a prerequisite.

---

## 8. Access Control

### 8.1 Read Access

| User Role | Can See |
|-----------|---------|
| Authenticated user | All published articles where `adminOnly = false` |
| Server admin | All published articles (including `adminOnly = true`) |
| Unauthenticated | Nothing (help requires login) |

### 8.2 Write Access

| Action | Who |
|--------|-----|
| Create article via UI | Server admin only |
| Edit article via UI | Server admin only |
| Delete article | Server admin only |
| Seed from repo | Deploy process (no user) |

### 8.3 Implementation

```typescript
// In API routes
const user = await getCurrentUser();
if (!user) return unauthorized();

// For read endpoints: filter adminOnly
const where = {
  isPublished: true,
  ...(user.isAdmin ? {} : { adminOnly: false }),
};

// For write endpoints: require admin
if (!user.isAdmin) {
  return NextResponse.json({ error: "Admin access required" }, { status: 403 });
}
```

---

## 9. Implementation Phases

### Phase 1: Foundation — Model, Seed, Read-Only UI

**Goal:** Help articles appear in the app, seeded from markdown files.

**Schema:**
- Add `HelpArticle` model to `schema.prisma`
- Add `helpArticleEdits` relation on `User`
- Migration: `npx prisma migrate dev --name add-help-articles`

**Seed:**
- Install `gray-matter` for frontmatter parsing
- Create `prisma/seed-help.ts`
- Write 3-5 starter articles (welcome, MCP setup, AI configuration)
- Add seed script to `package.json`

**API:**
- `GET /api/help` — list with category/tag/search filters
- `GET /api/help/[slug]` — get article
- Validation schema in `src/lib/validations/help.ts`

**UI:**
- `src/app/(dashboard)/help/page.tsx` — help index with category cards
- `src/app/(dashboard)/help/[slug]/page.tsx` — article view
- `src/components/help/HelpSidebar.tsx` — category navigation
- `src/components/help/HelpArticleView.tsx` — markdown renderer
- Add "Help" link to sidebar navigation

**Files touched:** ~10 (1 schema, 1 seed script, 2 API routes, 1 validation, 4 components, 1 nav update)

### Phase 2: Admin Editing

**Goal:** Admins can create and edit articles through the UI.

**API:**
- `POST /api/help` — create article
- `PATCH /api/help/[slug]` — update article
- `DELETE /api/help/[slug]` — delete article

**UI:**
- Edit button on article view (admin only)
- Inline editor with markdown textarea + toolbar
- "New Article" button in sidebar (admin only)
- Seeded vs custom badge on articles

**Files touched:** ~5 (3 API routes, 1 editor component, 1 view update)

### Phase 3: Search, Backlinks, TOC

**Goal:** Full navigation experience.

**API:**
- `GET /api/help/[slug]/backlinks` — find articles linking to this one

**UI:**
- Search input with server-side search
- Table of contents sidebar for long articles
- Backlinks / "Related" section at article bottom
- `[[wikilink]]` resolution within help articles

**Files touched:** ~5 (1 API route, search component, TOC integration, wikilink resolver, backlinks component)

### Phase 4: Starter Content

**Goal:** Ship a complete help library with the first build.

Write articles for all current features:

```
docs/help/
  getting-started/
    welcome.md              — What is Tandem? Getting oriented.
    inbox-processing.md     — How to process your inbox
    weekly-review.md        — The weekly review walkthrough
    contexts-and-energy.md  — Setting up @contexts and energy levels

  features/
    horizons-of-focus.md    — The six levels of perspective
    recurring-tasks.md      — Setting up recurring tasks
    ai-chat.md              — Using the in-app AI assistant
    mcp-setup-claude-ai.md  — Connecting Claude.ai via MCP
    mcp-setup-desktop.md    — Connecting Claude Desktop via MCP
    projects-and-tasks.md   — Creating projects, sub-projects, tasks
    waiting-for.md          — Delegating and tracking

  admin/
    server-settings.md      — Server configuration overview
    ai-configuration.md     — AI toggles, model selection, user controls
    user-management.md      — Adding users, roles, permissions

  troubleshooting/
    cloudflare-ai-bots.md   — Fixing 403s from Cloudflare bot blocking
    oauth-errors.md         — Common OAuth/MCP connection issues
```

---

## 10. Key Design Decisions

### Why a separate model instead of wiki scope?

The personal wiki is user-scoped (`userId` + slug uniqueness per user), permission-less (owner sees all), and designed for individual knowledge. Help articles are global (no user owner), permission-gated (admin edit, user read, adminOnly filter), and seeded from files. Sharing a model means every wiki query needs `if (scope === "help")` branches for visibility, editing, slug resolution, and seeding. Separate models keep each clean and let them evolve independently.

### Why seed from files instead of admin-only wiki?

- **Version control** — help content changes are PRs, reviewable, revertable
- **Ships with the build** — new installations get docs automatically
- **Consistent across instances** — every Tandem server starts with the same help library
- **Matches the code** — when a feature ships, its docs are in the same commit

### Why not unauthenticated access?

Help docs describe features of the app. If you're not logged in, you can't use those features. Requiring auth also means we don't need to worry about public-facing SEO, caching, or rate limiting on help routes. If public docs become needed (marketing site), that's a separate concern served by a static site generator, not the app.

### Why overwrite admin edits on deploy?

The repo is the source of truth. Admin edits via the UI are temporary customizations (fixing a typo, adding a local-specific note) that should be folded back into the repo. If the source file changes in a deploy, the repo version wins. Admin-created articles (no source file) are never touched by the seed script.

---

## 11. Future Considerations

- **Public help site** — Generate a static docs site from the same `docs/help/` markdown files using a tool like Docusaurus or VitePress. Same content, public-facing.
- **Version-gated articles** — Tag articles with the version that introduced the feature. Show/hide based on the running Tandem version. (Adds complexity — only worthwhile if many installations run different versions.)
- **User feedback** — "Was this helpful?" thumbs up/down on each article. Simple analytics for which articles need improvement.
- **AI-assisted search** — Use the AI chat to answer help questions by searching help articles as context. "How do I connect Claude.ai?" → AI reads the MCP setup article and summarizes.
- **Contextual help** — "?" icons next to features that link directly to the relevant help article. E.g., a "?" next to the MCP toggle in admin settings → `/help/mcp-setup-claude-ai`.
