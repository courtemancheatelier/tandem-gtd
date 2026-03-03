"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, History, Eye, GitCompare, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WikiDiffView } from "./WikiDiffView";
import { WikiMarkdownRenderer } from "./WikiMarkdownRenderer";
import { useToast } from "@/components/ui/use-toast";

interface VersionSummary {
  id: string;
  version: number;
  title: string;
  message: string | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

interface VersionDetail {
  id: string;
  version: number;
  title: string;
  content: string;
  tags: string[];
  message: string | null;
  createdAt: string;
}

interface WikiVersionHistoryProps {
  slug: string;
  currentContent: string;
  currentTitle: string;
  teamId?: string | null;
  onRevert: () => void;
}

export function WikiVersionHistory({
  slug,
  currentContent,
  currentTitle,
  teamId,
  onRevert,
}: WikiVersionHistoryProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewVersion, setViewVersion] = useState<VersionDetail | null>(null);
  const [compareVersion, setCompareVersion] = useState<VersionDetail | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const { toast } = useToast();

  const teamParam = teamId ? `&teamId=${teamId}` : "";
  const teamParamFirst = teamId ? `?teamId=${teamId}` : "";

  const fetchVersions = useCallback(async () => {
    const res = await fetch(`/api/wiki/${slug}/history${teamParamFirst}`);
    if (res.ok) {
      const data = await res.json();
      // Handle both paginated { versions } and legacy flat array
      if (Array.isArray(data)) {
        setVersions(data);
        setHasMore(false);
      } else {
        setVersions(data.versions);
        setHasMore(data.hasMore);
      }
    }
    setLoading(false);
  }, [slug, teamParamFirst]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  async function fetchVersionDetail(versionId: string): Promise<VersionDetail | null> {
    const res = await fetch(`/api/wiki/${slug}/history/${versionId}${teamParam}`);
    if (res.ok) return res.json();
    return null;
  }

  async function handleView(versionId: string) {
    const detail = await fetchVersionDetail(versionId);
    if (detail) {
      setViewVersion(detail);
      setCompareVersion(null);
    }
  }

  async function handleCompare(versionId: string) {
    const detail = await fetchVersionDetail(versionId);
    if (detail) {
      setCompareVersion(detail);
      setViewVersion(null);
    }
  }

  async function handleRevert(versionId: string) {
    setReverting(versionId);
    const res = await fetch(`/api/wiki/${slug}/history/${versionId}/revert${teamParam}`, {
      method: "POST",
    });
    setReverting(null);

    if (res.ok) {
      toast({ title: "Article reverted", description: "The article has been restored to the selected version." });
      onRevert();
    } else {
      toast({ title: "Error", description: "Failed to revert article", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No version history yet. Edits will create version snapshots.</p>
      </div>
    );
  }

  async function loadMoreVersions() {
    setLoadingMore(true);
    const res = await fetch(
      `/api/wiki/${slug}/history?offset=${versions.length}${teamParam}`
    );
    if (res.ok) {
      const data = await res.json();
      const newVersions = Array.isArray(data) ? data : data.versions;
      setVersions((prev) => [...prev, ...newVersions]);
      setHasMore(Array.isArray(data) ? false : data.hasMore);
    }
    setLoadingMore(false);
  }

  return (
    <div className="space-y-3">
      {/* Version timeline */}
      <div className="space-y-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-mono font-bold">
              v{v.version}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{v.title}</p>
              {v.message && (
                <p className="text-xs text-muted-foreground mt-0.5">{v.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {v.actor && (
                  <span className="font-medium text-foreground">{v.actor.name} &middot; </span>
                )}
                {new Date(v.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleView(v.id)}
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleCompare(v.id)}
              >
                <GitCompare className="h-3 w-3 mr-1" />
                Diff
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleRevert(v.id)}
                disabled={reverting === v.id}
              >
                {reverting === v.id ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-1" />
                )}
                Restore
              </Button>
            </div>
          </div>
        ))}
        {hasMore && (
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMoreVersions}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Load more
            </Button>
          </div>
        )}
      </div>

      {/* View version dialog */}
      <Dialog open={!!viewVersion} onOpenChange={() => setViewVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Version {viewVersion?.version}: {viewVersion?.title}
            </DialogTitle>
          </DialogHeader>
          {viewVersion && (
            <WikiMarkdownRenderer
              content={viewVersion.content}
              className="wiki-content"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Compare version dialog */}
      <Dialog open={!!compareVersion} onOpenChange={() => setCompareVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Diff: v{compareVersion?.version} vs Current
            </DialogTitle>
          </DialogHeader>
          {compareVersion && (
            <WikiDiffView
              oldContent={compareVersion.content}
              newContent={currentContent}
              oldTitle={compareVersion.title}
              newTitle={currentTitle}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
