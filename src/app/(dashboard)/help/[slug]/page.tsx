"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, HelpCircle, List } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HelpSidebar } from "@/components/help/HelpSidebar";
import { HelpMarkdownRenderer } from "@/components/help/HelpMarkdownRenderer";
import { WikiTableOfContents } from "@/components/wiki/WikiTableOfContents";
import { useTableOfContents } from "@/lib/hooks/use-table-of-contents";

interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  sortOrder: number;
  updatedAt: string;
}

interface HelpArticleSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  sortOrder: number;
  updatedAt: string;
}

export default function HelpArticlePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tocEntries = useTableOfContents(article?.content ?? "");

  const fetchData = useCallback(async () => {
    const [articleRes, listRes] = await Promise.all([
      fetch(`/api/help/${slug}`),
      fetch("/api/help"),
    ]);

    if (articleRes.ok) {
      setArticle(await articleRes.json());
    } else {
      setArticle(null);
    }

    if (listRes.ok) {
      const data = await listRes.json();
      setArticles(data.articles);
    }

    setLoading(false);
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            Help & Documentation
          </h1>
        </div>
        <Separator />
        <p className="text-muted-foreground">Article not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="h-6 w-6" />
          Help & Documentation
        </h1>
      </div>

      <Separator />

      {/* Mobile: Browse Articles button */}
      <Button
        variant="outline"
        className="md:hidden w-full"
        onClick={() => setSidebarOpen(true)}
      >
        <List className="h-4 w-4 mr-2" />
        Browse Articles
      </Button>
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-4">
          <SheetHeader className="mb-2">
            <SheetTitle>Articles</SheetTitle>
          </SheetHeader>
          <HelpSidebar articles={articles} activeSlug={slug} onArticleClick={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="hidden md:block w-56 flex-shrink-0">
          <HelpSidebar articles={articles} activeSlug={slug} />
        </div>

        {/* Article content */}
        <div className="flex-1 min-w-0">
          {/* Mobile TOC */}
          {tocEntries.length >= 3 && (
            <div className="mb-4 lg:hidden">
              <WikiTableOfContents entries={tocEntries} />
            </div>
          )}

          <div className="flex gap-8">
            <div className="flex-1 min-w-0">
              <article>
                <h1 className="text-2xl font-bold mb-1">{article.title}</h1>
                <p className="text-sm text-muted-foreground mb-4">
                  Last updated{" "}
                  {new Date(article.updatedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>

                <HelpMarkdownRenderer content={article.content} />

                {/* Tags */}
                {article.tags.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <div className="flex flex-wrap gap-2">
                      {article.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </div>

            {/* Desktop TOC */}
            {tocEntries.length >= 3 && (
              <div className="hidden lg:block w-56 flex-shrink-0">
                <WikiTableOfContents entries={tocEntries} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
