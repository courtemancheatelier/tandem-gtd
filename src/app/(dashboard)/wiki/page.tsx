"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookOpen, Plus, Loader2, FolderPlus } from "lucide-react";
import { TeamIcon } from "@/components/teams/team-icons";
import { useToast } from "@/components/ui/use-toast";
import {
  WikiArticleList,
  type WikiArticleSummary,
} from "@/components/wiki/WikiArticleList";
import { WikiRichEditorLazy } from "@/components/wiki/WikiRichEditorLoader";
import { HelpLink } from "@/components/shared/HelpLink";

interface Team {
  id: string;
  name: string;
  icon?: string | null;
}

function WikiPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teamIdParam = searchParams.get("teamId");

  const [articles, setArticles] = useState<WikiArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeScope, setActiveScope] = useState<string>(teamIdParam || "personal");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Move article state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSource, setMoveSource] = useState<WikiArticleSummary[]>([]);
  const [loadingMoveSource, setLoadingMoveSource] = useState(false);
  const [movingArticleId, setMovingArticleId] = useState<string | null>(null);

  const { toast } = useToast();

  // Fetch user's teams on mount
  useEffect(() => {
    async function fetchTeams() {
      const res = await fetch("/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    }
    fetchTeams();
  }, []);

  // Sync scope from URL param
  useEffect(() => {
    if (teamIdParam) {
      setActiveScope(teamIdParam);
    }
  }, [teamIdParam]);

  const currentTeamId = activeScope !== "personal" ? activeScope : null;

  const fetchArticles = useCallback(
    async (search?: string) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (currentTeamId) params.set("teamId", currentTeamId);

      const url = `/api/wiki${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      }
      setLoading(false);
    },
    [currentTeamId]
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (currentTeamId) params.set("teamId", currentTeamId);
    params.set("before", nextCursor);

    const res = await fetch(`/api/wiki?${params}`);
    if (res.ok) {
      const data = await res.json();
      setArticles((prev) => [...prev, ...data.articles]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    }
    setLoadingMore(false);
  }, [nextCursor, loadingMore, currentTeamId]);

  useEffect(() => {
    setLoading(true);
    fetchArticles();
  }, [fetchArticles]);

  const handleSearch = useCallback(
    (query: string) => {
      fetchArticles(query || undefined);
    },
    [fetchArticles]
  );

  function handleScopeChange(scope: string) {
    setActiveScope(scope);
    if (scope === "personal") {
      router.push("/wiki");
    } else {
      router.push(`/wiki?teamId=${scope}`);
    }
  }

  async function createArticle(data: {
    title: string;
    content: string;
    tags: string[];
  }) {
    setCreating(true);
    const res = await fetch("/api/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        teamId: currentTeamId || undefined,
      }),
    });
    setCreating(false);

    if (res.ok) {
      setCreateDialogOpen(false);
      toast({
        title: "Article created",
        description: `"${data.title}" has been added.`,
      });
      fetchArticles();
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to create article",
        variant: "destructive",
      });
    }
  }

  // Fetch articles from the "other" scope for the move dialog
  async function openMoveDialog() {
    setMoveDialogOpen(true);
    setLoadingMoveSource(true);
    // If we're in team scope, fetch personal articles. If personal, this shouldn't be called.
    const res = await fetch("/api/wiki");
    if (res.ok) {
      const data = await res.json();
      setMoveSource(data.articles);
    }
    setLoadingMoveSource(false);
  }

  async function moveArticle(articleId: string, targetTeamId: string | null) {
    setMovingArticleId(articleId);
    const res = await fetch("/api/wiki/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, targetTeamId }),
    });
    if (res.ok) {
      toast({ title: targetTeamId ? "Article added to team" : "Article moved to personal" });
      setMoveDialogOpen(false);
      fetchArticles();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to move article", variant: "destructive" });
    }
    setMovingArticleId(null);
  }

  const activeTeam = teams.find((t) => t.id === currentTeamId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            {activeTeam ? (
              <>
                <TeamIcon icon={activeTeam.icon} className="h-5 w-5" />
                {activeTeam.name} Wiki
              </>
            ) : (
              "Wiki"
            )}
            <HelpLink slug="what-is-gtd" />
          </h1>
          <p className="text-muted-foreground mt-1">
            {articles.length} article{articles.length !== 1 ? "s" : ""}{" "}
            {activeTeam ? `in ${activeTeam.name}` : "in your reference library"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Add from Personal — only shown in team scope */}
          {currentTeamId && (
            <Button variant="outline" size="sm" onClick={openMoveDialog}>
              <FolderPlus className="h-4 w-4 mr-1" />
              Add from Personal
            </Button>
          )}

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Article
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  New Wiki Article
                  {activeTeam && (
                    <span className="text-muted-foreground font-normal ml-2">
                      in {activeTeam.name}
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <WikiRichEditorLazy
                initialTitle=""
                initialContent=""
                initialTags={[]}
                onSubmit={createArticle}
                onCancel={() => setCreateDialogOpen(false)}
                submitLabel="Create Article"
                loading={creating}
                teamId={currentTeamId}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Scope selector tabs */}
      {teams.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeScope === "personal" ? "default" : "outline"}
            size="sm"
            onClick={() => handleScopeChange("personal")}
          >
            Personal
          </Button>
          {teams.map((team) => (
            <Button
              key={team.id}
              variant={activeScope === team.id ? "default" : "outline"}
              size="sm"
              onClick={() => handleScopeChange(team.id)}
            >
              <TeamIcon icon={team.icon} className="h-3.5 w-3.5 mr-1 inline" />
              {team.name}
            </Button>
          ))}
        </div>
      )}

      <Separator />

      <WikiArticleList
        articles={articles}
        onSearch={handleSearch}
        teamId={currentTeamId}
        teams={teams}
        onMoveArticle={moveArticle}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
      />

      {/* Add from Personal dialog (team scope) */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Personal Article to {activeTeam?.name}</DialogTitle>
          </DialogHeader>
          {loadingMoveSource ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : moveSource.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {moveSource.map((article) => (
                <Card key={article.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="py-2 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{article.title}</CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={movingArticleId === article.id}
                        onClick={() => moveArticle(article.id, currentTeamId)}
                      >
                        {movingArticleId === article.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No personal articles available to add.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WikiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <WikiPageContent />
    </Suspense>
  );
}
