"use client";

import { useEffect, useState, useCallback } from "react";
import { HelpCircle, Loader2, List, Coffee, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HelpSidebar } from "@/components/help/HelpSidebar";
import { HelpCategoryCards } from "@/components/help/HelpCategoryCards";

interface HelpArticleSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  sortOrder: number;
  updatedAt: string;
}

interface CategoryInfo {
  name: string;
  count: number;
  firstSlug?: string;
}

export default function HelpPage() {
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    const res = await fetch("/api/help");
    if (res.ok) {
      const data = await res.json();
      setArticles(data.articles);

      // Enrich categories with first article slug for navigation
      const catMap = new Map<string, string>();
      for (const article of data.articles) {
        if (!catMap.has(article.category)) {
          catMap.set(article.category, article.slug);
        }
      }
      const enriched = (data.categories as { name: string; count: number }[]).map((cat) => ({
        ...cat,
        firstSlug: catMap.get(cat.name),
      }));
      setCategories(enriched);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchArticles();
    fetch("/api/public/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.supportUrl) setSupportUrl(data.supportUrl);
      })
      .catch(() => {});
  }, [fetchArticles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        <p className="text-muted-foreground mt-1">
          {articles.length} article{articles.length !== 1 ? "s" : ""} across{" "}
          {categories.length} {categories.length === 1 ? "category" : "categories"}
        </p>
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
          <HelpSidebar articles={articles} onArticleClick={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="hidden md:block w-56 flex-shrink-0">
          <HelpSidebar articles={articles} />
        </div>

        {/* Content: category cards when no article selected */}
        <div className="flex-1 min-w-0">
          <HelpCategoryCards categories={categories} />
        </div>
      </div>

      {supportUrl && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Coffee className="h-4 w-4" />
              Support this server
            </CardTitle>
            <CardDescription>
              This Tandem instance is community-supported.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Support this server
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
