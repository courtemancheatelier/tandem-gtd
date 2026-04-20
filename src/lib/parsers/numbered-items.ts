/** Detect `1:foo 2:bar` or `1.foo 2.bar` (with optional spaces) numbered list format. Returns array of titles or null. */
export function parseNumberedItems(input: string): string[] | null {
  const parts = input.split(/(?=\d+[.:]\s*)/).filter(Boolean);
  if (parts.length < 2) return null;
  const titles: string[] = [];
  for (const part of parts) {
    const match = part.match(/^\d+[.:]\s*(.+)/);
    if (!match) return null;
    const title = match[1].trim();
    if (!title) return null;
    titles.push(title);
  }
  return titles.length >= 2 ? titles : null;
}
