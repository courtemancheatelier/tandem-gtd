"use client";

import Link from "next/link";
import React from "react";
import { slugify } from "@/lib/validations/wiki";

interface WikiLinkRendererProps {
  text: string;
  className?: string;
  teamId?: string | null;
}

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Renders plain text containing [[wiki links]] as clickable Next.js Links.
 * Use this for non-markdown contexts (e.g. task descriptions, notes).
 */
export function WikiLinkRenderer({ text, className, teamId }: WikiLinkRendererProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  WIKI_LINK_REGEX.lastIndex = 0;
  while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
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
    const teamQuery = teamId ? `?teamId=${teamId}` : "";
    const href = section
      ? `/wiki/${slug}${teamQuery}#${slugify(section)}`
      : `/wiki/${slug}${teamQuery}`;

    parts.push(
      <Link
        key={`${match.index}-${slug}`}
        href={href}
        className="text-primary underline hover:text-primary/80"
      >
        {content}
      </Link>
    );

    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return <span className={className}>{text}</span>;

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
