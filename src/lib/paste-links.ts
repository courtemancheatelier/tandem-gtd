const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "TR", "BLOCKQUOTE",
  "H1", "H2", "H3", "H4", "H5", "H6",
]);

/**
 * Recursively walk a DOM node and build a plain-text string,
 * converting <a> tags to Markdown and preserving line breaks.
 */
function walkNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName;

  // <br> → newline
  if (tag === "BR") return "\n";

  // <a> → Markdown link or plain text
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    const text = el.textContent?.trim() ?? href;

    if (!href.startsWith("http://") && !href.startsWith("https://")) {
      return text;
    }

    return text === href ? href : `[${text}](${href})`;
  }

  // Recurse into children
  let result = "";
  for (const child of Array.from(node.childNodes)) {
    result += walkNode(child);
  }

  // Block elements get a trailing newline
  if (BLOCK_TAGS.has(tag)) {
    result += "\n";
  }

  return result;
}

/**
 * Given an HTML string (from clipboard), extracts text content while
 * converting <a href="..."> tags to Markdown [text](url) syntax
 * and preserving line breaks from block elements and <br> tags.
 *
 * Returns the converted plain text, or null if no anchor tags were found
 * (signal to let the default paste behavior proceed).
 */
export function convertHtmlLinksToMarkdown(html: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const anchors = doc.querySelectorAll("a[href]");
  if (anchors.length === 0) return null;

  const raw = walkNode(doc.body);
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}
