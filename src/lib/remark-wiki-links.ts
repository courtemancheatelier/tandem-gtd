import type { Root, Content, Text, Link, Parent } from "mdast";
import { slugify } from "@/lib/validations/wiki";

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

type MdastNode = Root | Content;

/**
 * Remark plugin that transforms [[Title]] and [[Title#Section]] syntax
 * into markdown link nodes pointing to /wiki/ routes.
 */
export function remarkWikiLinks() {
  return (tree: Root) => {
    visitTextNodes(tree);
  };
}

function visitTextNodes(node: MdastNode) {
  if (!("children" in node)) return;
  const parent = node as Parent;

  // Process in reverse so splice indices remain valid
  for (let i = parent.children.length - 1; i >= 0; i--) {
    const child = parent.children[i];
    if (child.type === "code" || child.type === "inlineCode") continue;

    if (child.type === "text") {
      const replacement = splitTextNode((child as Text).value);
      if (replacement) {
        parent.children.splice(i, 1, ...replacement);
      }
    } else {
      visitTextNodes(child);
    }
  }
}

function splitTextNode(value: string): (Text | Link)[] | null {
  const parts: (Text | Link)[] = [];
  let lastIndex = 0;

  WIKI_LINK_REGEX.lastIndex = 0;
  let match;
  while ((match = WIKI_LINK_REGEX.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    const content = match[1].trim();
    const hashIndex = content.indexOf("#");
    let title: string;
    let section: string | undefined;

    if (hashIndex !== -1) {
      title = content.slice(0, hashIndex).trim();
      section = content.slice(hashIndex + 1).trim();
    } else {
      title = content;
    }

    const slug = slugify(title);
    const href = section
      ? `/wiki/${slug}#${slugify(section)}`
      : `/wiki/${slug}`;

    parts.push({
      type: "link",
      url: href,
      children: [{ type: "text", value: content }],
    });

    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return null;

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts;
}
