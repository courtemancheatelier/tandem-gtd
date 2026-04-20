"use client";

import React from "react";
import { WikiTagBadge } from "./WikiTagBadge";
import { WikiMarkdownRenderer } from "./WikiMarkdownRenderer";

interface WikiArticleViewProps {
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  onTagClick?: (tag: string) => void;
}

export function WikiArticleView({
  title,
  content,
  tags,
  updatedAt,
  onTagClick,
}: WikiArticleViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated {new Date(updatedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <WikiTagBadge
              key={tag}
              tag={tag}
              onClick={onTagClick}
            />
          ))}
        </div>
      )}

      <WikiMarkdownRenderer content={content} className="wiki-content" />
    </div>
  );
}
