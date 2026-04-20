"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HelpArticleSummary {
  slug: string;
  title: string;
  category: string;
  sortOrder: number;
}

interface HelpSidebarProps {
  articles: HelpArticleSummary[];
  activeSlug?: string;
  onArticleClick?: () => void;
}

// Fixed category ordering
const CATEGORY_ORDER: Record<string, number> = {
  "Getting Started": 0,
  "GTD Guide": 1,
  "About": 2,
  "Features": 3,
  "Admin": 4,
  "Troubleshooting": 5,
};

function getCategoryOrder(name: string): number {
  return CATEGORY_ORDER[name] ?? 50;
}

export function HelpSidebar({ articles, activeSlug, onArticleClick }: HelpSidebarProps) {
  // Group articles by category
  const categoryMap = new Map<string, HelpArticleSummary[]>();
  for (const article of articles) {
    const list = categoryMap.get(article.category) || [];
    list.push(article);
    categoryMap.set(article.category, list);
  }

  // Sort categories
  const sortedCategories = Array.from(categoryMap.entries()).sort(
    ([a], [b]) => getCategoryOrder(a) - getCategoryOrder(b) || a.localeCompare(b)
  );

  // Start with all collapsed except "Getting Started" and the active article's category
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>(["Getting Started"]);
    if (activeSlug) {
      const activeArticle = articles.find((a) => a.slug === activeSlug);
      if (activeArticle) initial.add(activeArticle.category);
    }
    return initial;
  });

  const toggleCategory = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <ScrollArea className="h-full">
      <nav className="space-y-1 py-2">
        {sortedCategories.map(([category, categoryArticles]) => {
          const isCollapsed = !expanded.has(category);
          const sorted = [...categoryArticles].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
          );

          return (
            <div key={category}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-1 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                onClick={() => toggleCategory(category)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {category}
              </Button>
              {!isCollapsed && (
                <div className="ml-2 space-y-0.5">
                  {sorted.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/help/${article.slug}`}
                      onClick={onArticleClick}
                      className={cn(
                        "block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                        activeSlug === article.slug
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {article.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </ScrollArea>
  );
}
