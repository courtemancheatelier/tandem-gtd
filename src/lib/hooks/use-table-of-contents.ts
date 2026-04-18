"use client";

import { useMemo } from "react";
import { slugify } from "@/lib/validations/wiki";

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

/**
 * Parse headings from markdown content and return a TOC entry list.
 */
export function useTableOfContents(content: string): TocEntry[] {
  return useMemo(() => {
    const entries: TocEntry[] = [];
    const lines = content.split("\n");
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.trimStart().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        entries.push({
          id: slugify(text),
          text,
          level,
        });
      }
    }

    return entries;
  }, [content]);
}
