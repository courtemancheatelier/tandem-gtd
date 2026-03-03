"use client";

import Link from "next/link";
import { Rocket, Zap, Shield, HelpCircle, BookOpen, Info } from "lucide-react";

interface CategoryInfo {
  name: string;
  count: number;
  firstSlug?: string;
}

interface HelpCategoryCardsProps {
  categories: CategoryInfo[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Getting Started": <Rocket className="h-8 w-8" />,
  "GTD Guide": <BookOpen className="h-8 w-8" />,
  "About": <Info className="h-8 w-8" />,
  "Features": <Zap className="h-8 w-8" />,
  "Admin": <Shield className="h-8 w-8" />,
  "Troubleshooting": <HelpCircle className="h-8 w-8" />,
};

const CATEGORY_ORDER: Record<string, number> = {
  "Getting Started": 0,
  "GTD Guide": 1,
  "About": 2,
  "Features": 3,
  "Admin": 4,
  "Troubleshooting": 5,
};

export function HelpCategoryCards({ categories }: HelpCategoryCardsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Welcome to Tandem Help</h2>
        <p className="text-muted-foreground mt-1">
          Browse articles by category or use the sidebar to find what you need.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...categories].sort((a, b) => (CATEGORY_ORDER[a.name] ?? 50) - (CATEGORY_ORDER[b.name] ?? 50) || a.name.localeCompare(b.name)).map((cat) => (
          <Link
            key={cat.name}
            href={cat.firstSlug ? `/help/${cat.firstSlug}` : `/help?category=${encodeURIComponent(cat.name)}`}
            className="group rounded-lg border border-border p-6 transition-colors hover:bg-accent hover:border-accent"
          >
            <div className="text-muted-foreground group-hover:text-accent-foreground mb-3">
              {CATEGORY_ICONS[cat.name] || <HelpCircle className="h-8 w-8" />}
            </div>
            <h3 className="font-semibold group-hover:text-accent-foreground">
              {cat.name}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {cat.count} article{cat.count !== 1 ? "s" : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
