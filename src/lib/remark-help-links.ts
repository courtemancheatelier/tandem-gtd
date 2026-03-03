import type { Root, Content, Text, Link, Parent } from "mdast";
import { slugify } from "@/lib/validations/wiki";

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

type MdastNode = Root | Content;

/**
 * Remark plugin that transforms [[Title]] and [[Title#Section]] syntax
 * into markdown link nodes pointing to /help/ routes.
 */
export function remarkHelpLinks() {
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

    // Support [[Target|Display Text]] pipe syntax
    const pipeIndex = content.indexOf("|");
    let target: string;
    let displayText: string;

    if (pipeIndex !== -1) {
      target = content.slice(0, pipeIndex).trim();
      displayText = content.slice(pipeIndex + 1).trim();
    } else {
      target = content;
      displayText = content;
    }

    // Support #section anchors
    const hashIndex = target.indexOf("#");
    let title: string;
    let section: string | undefined;

    if (hashIndex !== -1) {
      title = target.slice(0, hashIndex).trim();
      section = target.slice(hashIndex + 1).trim();
    } else {
      title = target;
    }

    const slug = slugify(title);
    const href = section
      ? `/help/${slug}#${slugify(section)}`
      : `/help/${slug}`;

    parts.push({
      type: "link",
      url: href,
      children: [{ type: "text", value: displayText }],
    });

    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return null;

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts;
}
