import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { WikiLinkNodeView } from "./WikiLinkNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: {
        title: string;
        section?: string | null;
      }) => ReturnType;
    };
  }
}

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      title: { default: null },
      section: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            title: el.getAttribute("data-title"),
            section: el.getAttribute("data-section") || null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes.title || "";
    const section = HTMLAttributes.section || "";
    const display = section ? `${title}#${section}` : title;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "",
        "data-title": title,
        "data-section": section || undefined,
      }),
      display,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkNodeView);
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: Record<string, unknown>, node: Record<string, unknown>) {
          const attrs = node.attrs as { title?: string; section?: string };
          const title = attrs?.title || "";
          const section = attrs?.section;
          if (section) {
            (state as { write: (s: string) => void }).write(`[[${title}#${section}]]`);
          } else {
            (state as { write: (s: string) => void }).write(`[[${title}]]`);
          }
        },
        parse: {
          setup(markdownit: Record<string, unknown>) {
            // Register a markdown-it inline rule to recognize [[...]] syntax
            const md = markdownit as {
              inline: {
                ruler: {
                  push: (
                    name: string,
                    fn: (state: MarkdownItInlineState, silent: boolean) => boolean
                  ) => void;
                };
              };
              renderer: {
                rules: Record<
                  string,
                  (
                    tokens: MarkdownItToken[],
                    idx: number
                  ) => string
                >;
              };
            };

            md.inline.ruler.push("wiki_link", wikiLinkRule);
            md.renderer.rules.wiki_link = wikiLinkRenderer;
          },
        },
      },
    };
  },

  // Suggestion plugin is added externally in TiptapEditor.tsx
  // to avoid Tiptap's lazy option resolution issues with mergeDeep
});

// markdown-it types for the inline rule
interface MarkdownItInlineState {
  src: string;
  pos: number;
  max: number;
  push: (type: string, tag: string, nesting: number) => MarkdownItToken;
}

interface MarkdownItToken {
  type: string;
  tag: string;
  content: string;
  markup: string;
  meta?: { title: string; section: string | null };
}

function wikiLinkRule(state: MarkdownItInlineState, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;

  // Check for [[
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) {
    return false;
  }

  // Find closing ]]
  const closeIdx = src.indexOf("]]", pos + 2);
  if (closeIdx === -1) return false;

  // No newlines allowed inside
  const content = src.slice(pos + 2, closeIdx);
  if (content.includes("\n")) return false;

  if (!silent) {
    const token = state.push("wiki_link", "", 0);
    token.content = content.trim();

    // Parse title#section
    const hashIndex = content.indexOf("#");
    if (hashIndex !== -1) {
      token.meta = {
        title: content.slice(0, hashIndex).trim(),
        section: content.slice(hashIndex + 1).trim(),
      };
    } else {
      token.meta = { title: content.trim(), section: null };
    }
  }

  state.pos = closeIdx + 2;
  return true;
}

function wikiLinkRenderer(
  tokens: MarkdownItToken[],
  idx: number
): string {
  const token = tokens[idx];
  const title = token.meta?.title || token.content;
  const section = token.meta?.section || "";
  const display = section ? `${title}#${section}` : title;
  const attrs = [
    `data-wiki-link=""`,
    `data-title="${escapeHtml(title)}"`,
  ];
  if (section) {
    attrs.push(`data-section="${escapeHtml(section)}"`);
  }
  return `<span ${attrs.join(" ")}>${escapeHtml(display)}</span>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
