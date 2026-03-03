"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Clock,
  Plus,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { HelpLink } from "@/components/shared/HelpLink";
import {
  WaitingForCard,
  type WaitingForItem,
} from "@/components/waiting-for/WaitingForCard";
import { WaitingForForm } from "@/components/waiting-for/WaitingForForm";

function categorize(items: WaitingForItem[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const needsFollowUp: WaitingForItem[] = [];
  const upcoming: WaitingForItem[] = [];
  const open: WaitingForItem[] = [];
  const resolved: WaitingForItem[] = [];

  for (const item of items) {
    if (item.isResolved) {
      resolved.push(item);
    } else if (item.followUpDate && new Date(item.followUpDate) <= startOfToday) {
      needsFollowUp.push(item);
    } else if (item.followUpDate && new Date(item.followUpDate) > startOfToday) {
      upcoming.push(item);
    } else {
      open.push(item);
    }
  }

  return { needsFollowUp, upcoming, open, resolved };
}

export default function WaitingForPage() {
  const [items, setItems] = useState<WaitingForItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/waiting-for?resolved=all");
    if (res.ok) {
      setItems(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleCreate(data: {
    description: string;
    person: string;
    dueDate: string | null;
    followUpDate: string | null;
  }) {
    const res = await fetch("/api/waiting-for", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setDialogOpen(false);
      fetchItems();
      toast({ title: "Waiting-for item created" });
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to create item",
        variant: "destructive",
      });
    }
  }

  async function handleResolve(id: string, resolved: boolean) {
    const res = await fetch(`/api/waiting-for/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isResolved: resolved }),
    });
    if (res.ok) {
      fetchItems();
      toast({
        title: resolved ? "Marked as resolved" : "Reopened",
      });
    }
  }

  async function handleUpdate(
    id: string,
    data: {
      description: string;
      person: string;
      dueDate: string | null;
      followUpDate: string | null;
    }
  ) {
    const res = await fetch(`/api/waiting-for/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      fetchItems();
      toast({ title: "Item updated" });
    } else {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Failed to update item",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/waiting-for/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchItems();
      toast({ title: "Item deleted" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { needsFollowUp, upcoming, open, resolved } = categorize(items);
  const unresolvedCount = needsFollowUp.length + upcoming.length + open.length;

  return (
    <div className="space-y-6">
      <ReviewBanner />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Waiting For
            <HelpLink slug="organize" />
          </h1>
          <p className="text-muted-foreground mt-1">
            {unresolvedCount} open item{unresolvedCount !== 1 ? "s" : ""} being tracked
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Waiting For
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Waiting For</DialogTitle>
            </DialogHeader>
            <WaitingForForm
              onSubmit={handleCreate}
              onCancel={() => setDialogOpen(false)}
              submitLabel="Create"
            />
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {/* Needs Follow-Up */}
      {needsFollowUp.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Needs Follow-Up ({needsFollowUp.length})
          </h2>
          <div className="grid gap-2">
            {needsFollowUp.map((item) => (
              <WaitingForCard
                key={item.id}
                item={item}
                urgency="needs-follow-up"
                onResolve={handleResolve}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Upcoming ({upcoming.length})
          </h2>
          <div className="grid gap-2">
            {upcoming.map((item) => (
              <WaitingForCard
                key={item.id}
                item={item}
                urgency="upcoming"
                onResolve={handleResolve}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Open */}
      {open.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Open ({open.length})
          </h2>
          <div className="grid gap-2">
            {open.map((item) => (
              <WaitingForCard
                key={item.id}
                item={item}
                urgency="open"
                onResolve={handleResolve}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {unresolvedCount === 0 && resolved.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              Nothing to wait for. Add a new item to start tracking delegated work.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {showResolved ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Resolved ({resolved.length})
          </button>
          {showResolved && (
            <div className="grid gap-2">
              {resolved.map((item) => (
                <WaitingForCard
                  key={item.id}
                  item={item}
                  urgency="resolved"
                  onResolve={handleResolve}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
