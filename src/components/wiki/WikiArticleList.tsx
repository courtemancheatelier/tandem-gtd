"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, BookOpen, Loader2, ArrowRightLeft } from "lucide-react";
import { WikiTagBadge } from "./WikiTagBadge";
import Link from "next/link";
import { TeamIcon } from "@/components/teams/team-icons";

export interface WikiArticleSummary {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  teamId?: string | null;
  team?: { id: string; name: string; icon?: string | null } | null;
  createdAt: string;
  updatedAt: string;
  snippet?: string;
}

interface TeamOption {
  id: string;
  name: string;
  icon?: string | null;
}

interface WikiArticleListProps {
  articles: WikiArticleSummary[];
  onSearch?: (query: string) => void;
  teamId?: string | null;
  teams?: TeamOption[];
  onMoveArticle?: (articleId: string, targetTeamId: string | null) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function WikiArticleList({
  articles,
  onSearch,
  teamId,
  teams,
  onMoveArticle,
  hasMore,
  onLoadMore,
  loadingMore,
}: WikiArticleListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced server-side search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (onSearch) {
        clearTimeout(debounceRef.current);
        setSearching(true);
        debounceRef.current = setTimeout(() => {
          onSearch(value);
          setSearching(false);
        }, 300);
      }
    },
    [onSearch]
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const article of articles) {
      for (const tag of article.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [articles]);

  // Filter articles by tag (search is now server-side)
  const filtered = useMemo(() => {
    return articles.filter((article) => {
      const matchesTag = !activeTag || article.tags.includes(activeTag);
      // If no onSearch prop, fallback to client-side title filtering
      const matchesSearch =
        onSearch || !searchQuery ||
        article.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }, [articles, activeTag, searchQuery, onSearch]);

  function toggleTag(tag: string) {
    setActiveTag((current) => (current === tag ? null : tag));
  }

  function getArticleHref(article: WikiArticleSummary) {
    const base = `/wiki/${article.slug}`;
    const articleTeamId = teamId || article.teamId;
    return articleTeamId ? `${base}?teamId=${articleTeamId}` : base;
  }

  const showMoveControls = onMoveArticle && teams && teams.length > 0;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search articles..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <WikiTagBadge
              key={tag}
              tag={tag}
              active={activeTag === tag}
              onClick={toggleTag}
            />
          ))}
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Article list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          <div className="grid gap-2">
            {filtered.map((article) => (
              <Card key={article.id} className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <Link href={getArticleHref(article)} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{article.title}</h3>
                        {article.team && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            <TeamIcon icon={article.team.icon} className="h-3 w-3 mr-1 inline" />
                            {article.team.name}
                          </Badge>
                        )}
                      </div>
                      {article.snippet && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {article.snippet}
                        </p>
                      )}
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {article.tags.map((tag) => (
                            <WikiTagBadge key={tag} tag={tag} />
                          ))}
                        </div>
                      )}
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(article.updatedAt).toLocaleDateString()}
                      </span>
                      {showMoveControls && (
                        <MoveButton
                          article={article}
                          teamId={teamId}
                          teams={teams}
                          onMove={onMoveArticle}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {hasMore && onLoadMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {articles.length === 0
                ? "No articles yet. Create your first wiki article!"
                : "No articles match your search or filter."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MoveButton({
  article,
  teamId,
  teams,
  onMove,
}: {
  article: WikiArticleSummary;
  teamId?: string | null;
  teams: TeamOption[];
  onMove: (articleId: string, targetTeamId: string | null) => void;
}) {
  if (teamId) {
    // In team scope — offer "Move to Personal"
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={(e) => {
          e.preventDefault();
          onMove(article.id, null);
        }}
        title="Move to personal"
      >
        <ArrowRightLeft className="h-3 w-3" />
      </Button>
    );
  }

  // In personal scope — offer "Move to Team X"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => e.preventDefault()}
          title="Move to team"
        >
          <ArrowRightLeft className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {teams.map((team) => (
          <DropdownMenuItem
            key={team.id}
            onClick={(e) => {
              e.preventDefault();
              onMove(article.id, team.id);
            }}
          >
            <TeamIcon icon={team.icon} className="h-3 w-3 mr-1.5 inline" />
            Move to {team.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
