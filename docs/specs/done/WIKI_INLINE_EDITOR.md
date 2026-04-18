# Wiki Inline Editor — WYSIWYG Editing Spec

**Status:** Draft
**Feature:** Replace raw markdown textarea with rich inline editor
**Priority:** High (UX polish before launch)
**Depends on:** Existing wiki infrastructure (WikiArticleForm, WikiArticleView, remark-wiki-links, use-wiki-autocomplete)

---

## 1. Problem Statement

The current wiki editing experience requires users to write raw markdown in a monospace `<Textarea>`. This creates two problems:

1. **Syntax barrier** — Users who don't know markdown can't format content without learning `##`, `**`, `- [ ]`, `|---|`, etc. This is a significant friction point for non-technical users in shared team wikis.
2. **Mode switching** — The current flow toggles between a rendered `WikiArticleView` and a raw-text `WikiArticleForm`. Users lose visual context when editing — they can't see what their formatting looks like until they save.

The goal is to provide a Notion-like inline editing experience where users type naturally, use a floating toolbar or slash commands for formatting, and see their content rendered in real time — while preserving markdown as the storage format for MCP compatibility, version history diffs, and API consumers.

---

## 2. Design Principles

1. **Markdown stays the source of truth.** The database stores markdown. The editor serializes to/from markdown transparently. MCP tools, API consumers, and version diffs all continue to work unchanged.
2. **Zero syntax knowledge required.** A user who has never seen markdown should be able to create a fully formatted article with headings, bold, links, tables, checklists, and wiki links.
3. **Inline editing, not mode switching.** Clicking "Edit" should transform the rendered view into an editable surface in-place — no separate form page, no layout shift.
4. **Preserve existing wiki features.** `[[wiki link]]` autocomplete, `[[Title#Section]]` anchors, GFM tables, task lists, and all current remark plugins must continue to work.
5. **Progressive disclosure.** Power users can still drop into a raw markdown "source view" when they want precise control.

---

## 3. Library Selection: Tiptap

### Why Tiptap

**Tiptap** (built on ProseMirror) is the recommended editor framework for this feature. Rationale:

| Criteria | Tiptap | Milkdown | react-markdown + contentEditable |
|----------|--------|----------|----------------------------------|
| Markdown round-trip | Excellent via `tiptap-markdown` | Native but less mature React support | Manual — fragile |
| Extension ecosystem | Huge (tables, task lists, mentions, slash commands) | Smaller | N/A |
| React integration | First-class `@tiptap/react` | Svelte-first, React wrapper | Already using react-markdown |
| Floating toolbar | Built-in `BubbleMenu` + `FloatingMenu` | Possible but manual | Manual |
| Community & maintenance | Very active, backed by Tiptap GmbH | Smaller community | N/A |
| Wiki link custom extension | Straightforward via custom `Node` or `Mark` | Possible | Already have remark plugin |
| Bundle size | ~150KB (treeshakeable) | ~100KB | Smallest |
| License | MIT | MIT | N/A |

**Alternatives considered and rejected:**

- **Milkdown** — Excellent markdown-native editor, but React support is less mature and the extension API is more complex for custom nodes like wiki links.
- **BlockNote** — Opinionated block-based editor (Notion clone). Good UX out of the box but harder to customize and heavier. Markdown serialization is lossy for edge cases.
- **Lexical (Meta)** — Powerful but lower-level than Tiptap. More work to get a polished experience. Markdown support is an afterthought.
- **Plain contentEditable + remark** — Fragile, cursor management nightmares, not worth the bundle savings.

### Packages to Install

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm \
  @tiptap/extension-placeholder @tiptap/extension-link \
  @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-header @tiptap/extension-table-cell \
  @tiptap/extension-image @tiptap/extension-code-block-lowlight \
  @tiptap/extension-underline @tiptap/extension-text-align \
  @tiptap/extension-highlight \
  tiptap-markdown
```

> **Note:** `tiptap-markdown` handles the markdown ↔ ProseMirror document round-trip. It uses `markdown-it` for parsing and a custom serializer for output.

---

## 4. Architecture Overview

### 4.1 Data Flow

```
┌──────────────┐     parse      ┌──────────────────┐     edit      ┌──────────────┐
│  PostgreSQL   │ ───────────▶  │  Tiptap Editor    │ ◀──────────▶ │  User types   │
│  (markdown)   │               │  (ProseMirror doc)│              │  & formats    │
└──────┬───────┘               └────────┬──────────┘              └──────────────┘
       │                                │
       │           serialize            │
       │  ◀─────────────────────────────┘
       │    (markdown string on save)
       ▼
┌──────────────┐
│  PATCH /api/  │
│  wiki/:slug   │
└──────────────┘
```

- **On load:** Markdown string → `tiptap-markdown` parses into ProseMirror document → rendered as editable rich text.
- **On save:** ProseMirror document → `tiptap-markdown` serializes back to markdown string → sent to existing API unchanged.
- **Storage format never changes.** The API, database schema, MCP tools, and version history all continue to work with raw markdown.

### 4.2 Component Hierarchy

```
WikiArticlePage (existing page component)
├── WikiArticleHeader (title, tags, metadata — always visible)
├── WikiRichEditor (NEW — replaces the toggle between WikiArticleView and WikiArticleForm)
│   ├── EditorToolbar (fixed toolbar above editor)
│   │   ├── FormattingButtons (bold, italic, headings, lists, etc.)
│   │   ├── InsertMenu (table, image, code block, horizontal rule)
│   │   └── SourceToggle (switch to raw markdown view)
│   ├── TiptapEditor (the actual editable surface)
│   │   ├── BubbleMenu (floating toolbar on text selection)
│   │   ├── SlashCommandMenu (triggered by typing "/")
│   │   └── WikiLinkSuggestion (triggered by typing "[[")
│   └── EditorFooter (save / cancel / word count / last saved)
└── WikiSourceEditor (raw markdown fallback — existing Textarea, shown when source toggle is active)
```

### 4.3 File Structure

```
src/components/wiki/
├── WikiArticleForm.tsx          # EXISTING — keep for create dialog (simplified)
├── WikiArticleView.tsx          # EXISTING — keep as read-only fallback / print view
├── WikiRichEditor.tsx           # NEW — main editor wrapper
├── editor/
│   ├── TiptapEditor.tsx         # NEW — core Tiptap instance + config
│   ├── EditorToolbar.tsx        # NEW — fixed formatting toolbar
│   ├── EditorBubbleMenu.tsx     # NEW — floating selection toolbar
│   ├── SlashCommandMenu.tsx     # NEW — "/" command palette
│   ├── WikiLinkExtension.ts     # NEW — custom Tiptap node for [[wiki links]]
│   ├── WikiLinkSuggestion.tsx   # NEW — suggestion dropdown (replaces use-wiki-autocomplete for editor)
│   ├── editor-styles.css        # NEW — Tiptap content area styling
│   └── extensions.ts            # NEW — centralized extension configuration
```

---

## 5. Feature Specifications

### 5.1 Inline Editing Mode

**Current behavior:** Click "Edit" → entire view swaps to `WikiArticleForm` with raw textarea.

**New behavior:**

1. Article page loads in **read mode** using the existing `WikiArticleView` (rendered markdown).
2. User clicks **"Edit"** button → the view smoothly transitions to the Tiptap editor. The content appears in the same layout, same fonts, same position — but is now editable. No page navigation, no layout shift.
3. A **toolbar** appears above the content area.
4. A **footer bar** appears below with Save / Cancel buttons and metadata (word count, last saved timestamp).
5. User clicks **"Save"** → editor serializes to markdown → PATCH request → returns to read mode.
6. User clicks **"Cancel"** → discard changes → return to read mode. If content has changed, show a confirmation dialog: "You have unsaved changes. Discard?"

**Autosave (stretch goal):** Debounced autosave every 30 seconds to localStorage. On page load, check for a more recent localStorage draft and offer to restore it. This prevents data loss from accidental navigation.

### 5.2 Fixed Toolbar

A horizontal toolbar pinned above the editor content. Groups organized left-to-right by frequency of use:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [¶▾] │ B  I  S  ˜  </>  │ • ─ ☐ 1. │ 🔗 📷 ── 📊 │ ← → │ [</>] │
│ Block  Text formatting    Lists       Insert        Undo   Source │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Block type dropdown** `[¶▾]`:
- Paragraph (default)
- Heading 1
- Heading 2
- Heading 3
- Blockquote
- Code Block

**Text formatting:**
- **Bold** (`Cmd+B`)
- *Italic* (`Cmd+I` — note: conflicts with Quick Capture shortcut. When editor is focused, `Cmd+I` should be italic. Quick Capture should use a different check or only fire when no editor is focused.)
- ~~Strikethrough~~ (`Cmd+Shift+X`)
- `Inline code` (`Cmd+E`)

**Lists:**
- Bullet list
- Ordered list
- Task list (checkboxes)

**Insert:**
- Link (`Cmd+K` — note: similar conflict consideration with global search. Editor focus takes precedence.)
- Image (URL input dialog)
- Horizontal rule
- Table (insert 3×3 default, resize handles after)

**History:**
- Undo (`Cmd+Z`)
- Redo (`Cmd+Shift+Z`)

**Source toggle:**
- Switch to raw markdown view (and back). Icon: `</>`.

**Responsive behavior:** On mobile (< 640px), the toolbar becomes scrollable horizontally. Less-used items (table, image, horizontal rule) collapse into a `⊕ More` dropdown.

### 5.3 Bubble Menu (Selection Toolbar)

When the user selects text, a floating toolbar appears above the selection with contextual actions:

- Bold, Italic, Strikethrough, Code
- Link (create/edit)
- Highlight
- Clear formatting

The bubble menu does NOT include block-level actions (headings, lists). Those belong in the fixed toolbar and slash commands.

### 5.4 Slash Commands

Typing `/` at the start of a new line (or after a space) opens a filterable command palette:

| Command | Action | Icon |
|---------|--------|------|
| `/h1` | Heading 1 | `H1` |
| `/h2` | Heading 2 | `H2` |
| `/h3` | Heading 3 | `H3` |
| `/bullet` | Bullet list | `•` |
| `/numbered` | Numbered list | `1.` |
| `/todo` | Task list | `☐` |
| `/table` | Insert table | `⊞` |
| `/code` | Code block | `</>` |
| `/quote` | Blockquote | `"` |
| `/divider` | Horizontal rule | `—` |
| `/image` | Insert image | `📷` |
| `/link` | Insert wiki link `[[` | `🔗` |

**Behavior:**
- Typing `/` opens the menu with all options visible.
- Continued typing filters the list (fuzzy match).
- Arrow keys navigate, Enter selects, Escape dismisses.
- The `/` character is consumed (not inserted into content) when a command is selected.

### 5.5 Wiki Link Integration

**This is critical — wiki links are a core Tandem feature.**

**Custom Tiptap Extension: `WikiLink`**

Create a custom `Node` extension that:
1. **Renders as a styled inline element** — looks like a pill/chip with a link icon, visually distinct from regular text. Shows the article title. Clicking it navigates to the wiki article (in read mode) or opens in new tab (in edit mode with Cmd+Click).
2. **Stored as `[[Title]]` in markdown** — the `tiptap-markdown` serializer must output `[[Title]]` syntax, and the parser must recognize it and create `WikiLink` nodes.
3. **Triggered by typing `[[`** — opens the existing wiki autocomplete suggestion dropdown (reuse data from `use-wiki-autocomplete` hook but adapted for Tiptap's suggestion API).
4. **Supports section links** — `[[Title#Section]]` rendered with both title and section visible.
5. **Broken link detection** — if the linked article doesn't exist, render with a dashed underline and different color (similar to Wikipedia red links). Clicking creates a new article with that title pre-filled.

**Implementation approach:**

```typescript
// WikiLinkExtension.ts — skeleton
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true, // non-editable inline node

  addAttributes() {
    return {
      title: { default: null },
      section: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wiki-link': '' }), 0]
  },

  // Markdown serialization handled by tiptap-markdown config
  // Parse: detect [[...]] in markdown input
  // Serialize: output [[Title]] or [[Title#Section]]

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkNodeView)
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '[[',
        // ... suggestion plugin config pointing to WikiLinkSuggestion component
      }),
    ]
  },
})
```

### 5.6 Table Editing

Tables are a common wiki use case (meeting notes, comparison charts, contact lists). The current raw markdown table syntax is extremely painful to edit.

**Tiptap table extensions provide:**
- Visual table with resizable columns
- Add/remove rows and columns via context menu or toolbar buttons
- Tab to navigate between cells
- Cell merging (stretch goal)

**Markdown output:** Standard GFM pipe tables. `tiptap-markdown` handles this natively with the table extensions.

**Table insertion flow:**
1. User triggers via toolbar button, slash command, or typing `|` at start of line.
2. A small grid picker appears (like Google Docs) — drag to select dimensions (max 8×8).
3. Table is inserted with the selected dimensions, cursor placed in first cell.

### 5.7 Task Lists (Checkboxes)

Interactive checkboxes that work in both read mode and edit mode:

- **Read mode:** Clicking a checkbox toggles it and saves the change (PATCH only the content field). This already works partially in the current `WikiArticleView` but checkboxes are disabled.
- **Edit mode:** Checkboxes are naturally interactive in Tiptap's task list extension.
- **Markdown:** Serialized as `- [ ]` / `- [x]` per GFM spec.

### 5.8 Source View Toggle

A `</>` button in the toolbar switches between WYSIWYG and raw markdown:

1. Click `</>` → editor serializes current ProseMirror doc to markdown → displays in a monospace `<Textarea>` (the existing textarea component with wiki autocomplete support).
2. User edits raw markdown directly.
3. Click `</>` again → textarea content parsed back into Tiptap → returns to WYSIWYG.
4. If parsing fails (malformed markdown), show a toast warning and stay in source view.

This gives power users an escape hatch while keeping the default experience friendly.

### 5.9 Keyboard Shortcuts

All shortcuts should only fire when the Tiptap editor is focused to avoid conflicts with Tandem's global shortcuts (`Cmd+K` for search, `Cmd+I` for inbox capture).

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Bold |
| `Cmd+I` | Italic (editor-scoped only) |
| `Cmd+E` | Inline code |
| `Cmd+Shift+X` | Strikethrough |
| `Cmd+K` | Insert/edit link (editor-scoped only) |
| `Cmd+Shift+7` | Ordered list |
| `Cmd+Shift+8` | Bullet list |
| `Cmd+Shift+9` | Task list |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+S` | Save article |
| `Cmd+Enter` | Save and exit edit mode |
| `Escape` | Exit edit mode (with unsaved changes prompt if dirty) |
| `Tab` (in table) | Next cell |
| `Shift+Tab` (in table) | Previous cell |
| `[[` | Open wiki link autocomplete |
| `/` (start of line) | Open slash command menu |

### 5.10 Image Handling

For v1, images are URL-only (no upload):

1. User clicks image button or types `/image`.
2. Dialog appears with URL input field and optional alt text.
3. Image is inserted inline and rendered as `<img>` in the editor.
4. Serialized as `![alt](url)` in markdown.

**Future (v2):** File upload to local storage or S3-compatible bucket. Drag-and-drop and paste from clipboard.

---

## 6. Create Article Flow

The "New Article" flow currently opens a dialog with the `WikiArticleForm`. Update this:

1. **Keep the dialog for title + tags entry** — title is required before creating the article.
2. **On submit, create the article via POST** with minimal content (empty or template).
3. **Redirect to the new article page in edit mode** — the Tiptap editor loads immediately, cursor ready.
4. This matches the mental model: "I'm creating a page, then writing on it" rather than "I'm filling out a form."

**Template support (stretch goal):** When creating a new article, offer template options (Meeting Notes, Decision Log, Reference, Blank). Templates are themselves wiki articles tagged with `template`.

---

## 7. Mobile Considerations

- **Toolbar:** Horizontally scrollable with momentum scroll. Most-used actions (bold, italic, list) are visible first. Less-used items in an overflow menu.
- **Bubble menu:** Positioned above selection as usual. On mobile keyboards, ensure the menu doesn't get obscured. Use `shouldShow` logic to check viewport constraints.
- **Slash commands:** Work normally — mobile users can type `/` and get the command palette.
- **Touch targets:** All toolbar buttons must be minimum 44×44px tap targets per Apple HIG.
- **Editor height:** `min-height: 60vh` to ensure comfortable editing area above the keyboard.

---

## 8. Styling

### 8.1 Editor Content Area

The Tiptap editor content should match the existing `WikiArticleView` styling exactly. Users should not perceive a visual difference between read mode and edit mode (except for the toolbar and a subtle border/outline on the content area).

```css
/* editor-styles.css */
.tiptap-editor {
  /* Match existing wiki-content class */
}

.tiptap-editor:focus-within {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
  border-radius: var(--radius);
}

/* Placeholder text for empty editor */
.tiptap-editor p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  float: left;
  height: 0;
}

/* Wiki link inline nodes */
.tiptap-editor [data-wiki-link] {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-decoration-style: solid;
  cursor: pointer;
  border-radius: 2px;
  padding: 0 2px;
}

.tiptap-editor [data-wiki-link].broken {
  text-decoration-style: dashed;
  opacity: 0.7;
}

/* Table styling */
.tiptap-editor table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}

.tiptap-editor th,
.tiptap-editor td {
  border: 1px solid hsl(var(--border));
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.tiptap-editor th {
  background: hsl(var(--muted));
  font-weight: 600;
}

/* Task list checkboxes */
.tiptap-editor ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.tiptap-editor ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
```

### 8.2 Dark Mode

All editor styling must use CSS custom properties (`hsl(var(--...))`) from the existing shadcn/ui theme. No hardcoded colors. The editor should work identically in light and dark mode with zero additional configuration.

---

## 9. Migration Strategy

### 9.1 Backward Compatibility

- **No database migration needed.** Content is still stored as markdown.
- **No API changes.** The PATCH endpoint still accepts `{ content: "markdown string" }`.
- **MCP tools unchanged.** `tandem_wiki_create`, `tandem_wiki_update`, etc. still send/receive raw markdown.
- **Version history unchanged.** Diffs still compare markdown strings.

### 9.2 Rollout Plan

**Phase 1: Editor component (this spec)**
- Build `WikiRichEditor` with Tiptap, toolbar, bubble menu, and slash commands.
- Build `WikiLinkExtension` with autocomplete.
- Integrate into article page as the default edit experience.
- Keep `WikiArticleView` for read mode (rendered via react-markdown as today).
- Source view toggle available.

**Phase 2: Unified view (future)**
- Replace `WikiArticleView` with a non-editable Tiptap instance for consistency.
- This allows interactive checkboxes in read mode and eliminates the need for two separate rendering paths (react-markdown vs Tiptap).

**Phase 3: Real-time collaboration (future, post-launch)**
- Tiptap supports Yjs for real-time collaborative editing.
- When team wiki editing becomes a priority, add `@tiptap/extension-collaboration` + Yjs websocket provider.

---

## 10. Testing Requirements

### 10.1 Markdown Round-Trip Tests

Critical: content must survive edit → save → reload cycles without corruption.

Write Jest tests for:
- Basic formatting (bold, italic, strikethrough, code)
- Headings (h1-h3)
- Lists (bullet, ordered, task lists with checked/unchecked states)
- Links (regular and wiki links `[[Title]]`, `[[Title#Section]]`)
- Tables (including tables with inline formatting in cells)
- Code blocks (with language specifier)
- Blockquotes (including nested)
- Images
- Horizontal rules
- Mixed content (a realistic article with all of the above)
- Edge cases: empty document, single character, deeply nested lists

### 10.2 Wiki Link Tests

- Typing `[[` opens suggestion dropdown
- Selecting a suggestion inserts `WikiLink` node
- Serialized output contains `[[Title]]`
- Section links serialize as `[[Title#Section]]`
- Broken links render with distinct styling
- Clicking broken link in edit mode opens create-article flow

### 10.3 Keyboard Shortcut Isolation

- `Cmd+I` triggers italic when editor is focused
- `Cmd+I` triggers inbox capture when editor is NOT focused
- `Cmd+K` triggers link dialog when editor is focused
- `Cmd+K` triggers global search when editor is NOT focused
- `Cmd+S` triggers save when editor is focused

### 10.4 Mobile

- Toolbar scrolls horizontally on narrow viewports
- Slash commands work with on-screen keyboard
- Bubble menu doesn't get clipped by viewport edges

---

## 11. Performance Considerations

- **Lazy load the editor.** Tiptap + extensions are ~150KB. Use `next/dynamic` with `ssr: false` to only load when the user clicks "Edit". Read mode continues to use the lightweight `react-markdown` renderer.
- **Debounce serialization.** Don't serialize to markdown on every keystroke. Serialize on save, on source toggle, and on a 30-second autosave interval.
- **Extension treeshaking.** Only import the Tiptap extensions actually used. Don't import the full starter-kit if we're configuring extensions individually.

---

## 12. Accessibility

- All toolbar buttons have `aria-label` attributes.
- Toolbar is navigable with `Tab` and arrow keys.
- Active formatting states are conveyed via `aria-pressed`.
- Slash command menu and wiki link dropdown use proper `role="listbox"` and `aria-activedescendant`.
- The editor content area has `role="textbox"` and `aria-multiline="true"`.
- Focus management: entering edit mode focuses the editor, exiting returns focus to the "Edit" button.

---

## 13. Open Questions

1. **Autosave behavior** — Should we autosave to the server (requires conflict detection for team wikis) or only to localStorage (simpler, covers the "accidental navigation" case)?
2. **Code block language selection** — Tiptap's code block extension can include a language dropdown for syntax highlighting. Worth including in v1 or defer?
3. **Drag-and-drop blocks** — Tiptap supports block-level drag handles (like Notion). Adds complexity. Include or defer?
4. **Create article dialog vs inline** — Should "New Article" still use a dialog for title/tags, or should it create a blank article and let the user set title inline?
5. **`tiptap-markdown` vs custom serializer** — `tiptap-markdown` may not handle `[[wiki links]]` out of the box. We'll likely need to register a custom serializer/parser for the `WikiLink` node. Need to verify the extension API supports this cleanly.

---

## 14. Effort Estimate

| Component | Estimate |
|-----------|----------|
| Tiptap core setup + extension config | 2–3 hours |
| EditorToolbar (fixed) | 2–3 hours |
| BubbleMenu | 1–2 hours |
| SlashCommandMenu | 2–3 hours |
| WikiLinkExtension + suggestion dropdown | 4–6 hours |
| `tiptap-markdown` integration + custom wiki link serializer | 3–4 hours |
| Source view toggle | 1–2 hours |
| Table editing UX | 1–2 hours |
| Styling (match existing wiki-content) | 2–3 hours |
| Keyboard shortcut isolation | 1–2 hours |
| Article page integration (replace edit/view toggle) | 2–3 hours |
| Testing (round-trip, wiki links, shortcuts) | 3–4 hours |
| Mobile polish | 1–2 hours |
| **Total** | **~25–40 hours** |

The WikiLinkExtension is the highest-risk item due to custom serialization. Start there as a spike to validate the approach before building the rest.
