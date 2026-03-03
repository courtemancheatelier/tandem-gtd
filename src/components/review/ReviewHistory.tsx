"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle,
  Calendar,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bot,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface Review {
  id: string;
  status: string;
  weekOf: string;
  notes: string | null;
  checklist: Record<string, boolean> | null;
  completedAt: string | null;
  createdAt: string;
  aiCoachUsed?: boolean;
  aiSummary?: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function ReviewHistory() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const fetchReviews = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?page=${pageNum}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        setPagination(data.pagination || null);
      }
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReviews(page);
  }, [page, fetchReviews]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== id));
        toast({ title: "Review deleted" });
      } else {
        toast({
          title: "Failed to delete",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Failed to delete",
        variant: "destructive",
      });
    }
    setDeletingId(null);
  }

  function formatWeekOf(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getCompletedStepCount(checklist: Record<string, boolean> | null): number {
    if (!checklist) return 0;
    return Object.values(checklist).filter(Boolean).length;
  }

  // Filter to only show completed reviews
  const completedReviews = reviews.filter((r) => r.status === "COMPLETED");

  if (loading && reviews.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (completedReviews.length === 0 && !loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No completed reviews yet. Start your first weekly review above.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {completedReviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    Week of {formatWeekOf(review.weekOf)}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Completed {formatDate(review.completedAt || review.createdAt)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {getCompletedStepCount(review.checklist)}/3 steps
                    </Badge>
                    {review.aiCoachUsed && (
                      <Badge variant="secondary" className="text-xs">
                        <Bot className="h-3 w-3 mr-1" />
                        AI Coach
                      </Badge>
                    )}
                  </div>
                  {review.notes && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {review.notes}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(review.id)}
                disabled={deletingId === review.id}
              >
                {deletingId === review.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="sr-only">Delete</span>
              </Button>
            </div>

            {/* AI Summary expandable section */}
            {review.aiSummary && (
              <Collapsible className="mt-3">
                <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                  <Bot className="h-3 w-3" />
                  AI Summary
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs">
                    <div className="prose prose-xs dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {review.aiSummary}
                      </ReactMarkdown>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
