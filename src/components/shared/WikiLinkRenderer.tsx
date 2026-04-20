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
const MD_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

/**
 * Splits a plain-text string on Markdown [text](url) links, returning
 * React nodes with external links rendered as <a> tags.
 */
function renderMarkdownLinks(segment: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  MD_LINK_REGEX.lastIndex = 0;
  while ((match = MD_LINK_REGEX.exec(segment)) !== null) {
    if (match.index > lastIndex) {
      parts.push(segment.slice(lastIndex, match.index));
    }

    const linkText = match[1];
    const url = match[2];

    parts.push(
      <a
        key={`${keyPrefix}-md-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:text-primary/80"
      >
        {linkText}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return [segment];

  if (lastIndex < segment.length) {
    parts.push(segment.slice(lastIndex));
  }

  return parts;
}

/**
 * Renders plain text containing [[wiki links]] and [text](url) Markdown links.
 * Wiki links open in-app; Markdown links open in a new tab.
 */
export function WikiLinkRenderer({ text, className, teamId }: WikiLinkRendererProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  WIKI_LINK_REGEX.lastIndex = 0;
  while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderMarkdownLinks(text.slice(lastIndex, match.index), `pre-${match.index}`));
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

  if (parts.length === 0) {
    const mdParts = renderMarkdownLinks(text, "root");
    if (mdParts.length === 1 && typeof mdParts[0] === "string") {
      return <span className={className}>{text}</span>;
    }
    return <span className={className}>{mdParts}</span>;
  }

  if (lastIndex < text.length) {
    parts.push(...renderMarkdownLinks(text.slice(lastIndex), `post-${lastIndex}`));
  }

  return <span className={className}>{parts}</span>;
}
