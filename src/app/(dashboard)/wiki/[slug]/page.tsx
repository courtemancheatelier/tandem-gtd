"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Edit,
  Trash,
  Loader2,
  History,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { WikiArticleView } from "@/components/wiki/WikiArticleView";
import { WikiRichEditorLazy } from "@/components/wiki/WikiRichEditorLoader";
import { WikiTableOfContents } from "@/components/wiki/WikiTableOfContents";
import { WikiBacklinks } from "@/components/wiki/WikiBacklinks";
import { WikiVersionHistory } from "@/components/wiki/WikiVersionHistory";
import { WikiConflictDialog } from "@/components/wiki/WikiConflictDialog";
import { useTableOfContents } from "@/lib/hooks/use-table-of-contents";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface WikiArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  teamId?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

function WikiArticlePageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const teamId = searchParams.get("teamId");
  const { toast } = useToast();
  const { data: session } = useSession();

  const [article, setArticle] = useState<WikiArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingUpdateData, setPendingUpdateData] = useState<{
    title: string;
    content: string;
    tags: string[];
    message?: string;
    _conflictVersion?: number;
  } | null>(null);

  const tocEntries = useTableOfContents(article?.content ?? "");

  // Use teamId from URL, or from the loaded article (for links without ?teamId)
  const effectiveTeamId = teamId || article?.teamId || null;
  const teamParam = effectiveTeamId ? `?teamId=${effectiveTeamId}` : "";
  const backLink = effectiveTeamId ? `/wiki?teamId=${effectiveTeamId}` : "/wiki";

  const fetchArticle = useCallback(async () => {
    const urlTeamParam = teamId ? `?teamId=${teamId}` : "";
    const res = await fetch(`/api/wiki/${slug}${urlTeamParam}`);
    if (res.ok) {
      setArticle(await res.json());
    } else {
      setArticle(null);
    }
    setLoading(false);
  }, [slug, teamId]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  // Check if current user is team admin (for delete permission)
  useEffect(() => {
    async function checkAdmin() {
      if (!effectiveTeamId || !session?.user?.id) {
        setIsTeamAdmin(false);
        return;
      }
      const res = await fetch(`/api/teams/${effectiveTeamId}`);
      if (res.ok) {
        const team = await res.json();
        const member = team.members?.find(
          (m: { user: { id: string }; role: string }) =>
            m.user.id === session.user.id
        );
        setIsTeamAdmin(member?.role === "ADMIN");
      }
    }
    checkAdmin();
  }, [effectiveTeamId, session?.user?.id]);

  async function handleUpdate(data: {
    title: string;
    content: string;
    tags: string[];
    message?: string;
  }) {
    if (!article) return;

    setSaving(true);
    const res = await fetch(`/api/wiki/${article.slug}${teamParam}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        version: article.version,
      }),
    });
    setSaving(false);

    if (res.status === 409) {
      // Conflict detected — store conflict data for the dialog
      const conflict = await res.json();
      setPendingUpdateData({ ...data, _conflictVersion: conflict.currentVersion });
      setConflictOpen(true);
      return;
    }

    if (res.ok) {
      const updated = await res.json();
      setArticle(updated);
      setEditing(false);
      toast({ title: "Article updated" });
      // If slug changed, navigate to new URL
      if (updated.slug !== slug) {
        router.replace(`/wiki/${updated.slug}${teamParam}`);
      }
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to update article",
        variant: "destructive",
      });
    }
  }

  async function handleConflictOverwrite() {
    if (!article || !pendingUpdateData) return;

    const { _conflictVersion, ...updatePayload } = pendingUpdateData;

    setSaving(true);
    // Re-send with the current server version to force overwrite
    const res = await fetch(`/api/wiki/${article.slug}${teamParam}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...updatePayload,
        ..._conflictVersion ? { version: _conflictVersion } : {},
      }),
    });
    setSaving(false);

    setConflictOpen(false);
    setPendingUpdateData(null);

    if (res.ok) {
      const updated = await res.json();
      setArticle(updated);
      setEditing(false);
      toast({ title: "Article updated (overwritten)" });
      if (updated.slug !== slug) {
        router.replace(`/wiki/${updated.slug}${teamParam}`);
      }
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to update article",
        variant: "destructive",
      });
    }
  }

  function handleConflictDiscard() {
    setConflictOpen(false);
    setPendingUpdateData(null);
    setEditing(false);
    fetchArticle();
  }

  function handleConflictCopy() {
    if (pendingUpdateData) {
      navigator.clipboard.writeText(pendingUpdateData.content);
      toast({ title: "Content copied to clipboard. Paste your changes into the editor below.", duration: 5000 });
    }
    setConflictOpen(false);
    setPendingUpdateData(null);
    // Stay in editing mode so the user can paste their content back in
    fetchArticle();
  }

  async function handleDelete() {
    if (!article) return;

    const res = await fetch(`/api/wiki/${article.slug}${teamParam}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast({ title: "Article deleted", description: `"${article.title}" has been removed.` });
      router.push(backLink);
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to delete article",
        variant: "destructive",
      });
    }
  }

  // For team articles, only show delete to admins
  const canDelete = !effectiveTeamId || isTeamAdmin;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="space-y-4">
        <Link href={backLink}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Wiki
          </Button>
        </Link>
        <p className="text-muted-foreground">Article not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={backLink}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Wiki
            </Button>
          </Link>
          {teamId && (
            <Badge variant="secondary" className="text-xs">
              Team
            </Badge>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Content or Edit Form */}
      {editing ? (
        <WikiRichEditorLazy
          key={article.version}
          initialTitle={article.title}
          initialContent={article.content}
          initialTags={article.tags}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          loading={saving}
          teamId={teamId}
        />
      ) : (
        <div className="flex gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Mobile TOC */}
            {tocEntries.length >= 3 && (
              <div className="mb-4 lg:hidden">
                <WikiTableOfContents entries={tocEntries} />
              </div>
            )}

            <WikiArticleView
              title={article.title}
              content={article.content}
              tags={article.tags}
              updatedAt={article.updatedAt}
            />

            {/* Backlinks */}
            <div className="mt-8">
              <Separator className="mb-6" />
              <WikiBacklinks slug={article.slug} teamId={teamId} />
            </div>
          </div>

          {/* Desktop TOC sidebar */}
          {tocEntries.length >= 3 && (
            <div className="hidden lg:block w-56 flex-shrink-0">
              <WikiTableOfContents entries={tocEntries} />
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Article</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{article.title}&rdquo;? This
            action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <WikiVersionHistory
            slug={article.slug}
            currentContent={article.content}
            currentTitle={article.title}
            teamId={teamId}
            onRevert={() => {
              setHistoryOpen(false);
              fetchArticle();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Conflict Dialog */}
      <WikiConflictDialog
        open={conflictOpen}
        onOverwrite={handleConflictOverwrite}
        onDiscard={handleConflictDiscard}
        onCopy={handleConflictCopy}
      />
    </div>
  );
}

export default function WikiArticlePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <WikiArticlePageContent />
    </Suspense>
  );
}
