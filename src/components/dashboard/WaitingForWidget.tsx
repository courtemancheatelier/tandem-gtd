"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Loader2 } from "lucide-react";

interface WaitingForItem {
  id: string;
  description: string;
  person: string;
  dueDate: string | null;
  followUpDate: string | null;
  isResolved: boolean;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil(
    (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function WaitingForWidget() {
  const [items, setItems] = useState<WaitingForItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/waiting-for")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Waiting For</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Waiting For</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing pending from others
          </p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const needsFollowUp = items.filter(
    (i) => i.followUpDate && new Date(i.followUpDate) <= startOfToday
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Waiting For
            <Badge variant="secondary" className="ml-2 text-xs">
              {items.length}
            </Badge>
          </CardTitle>
          <Link
            href="/waiting-for"
            className="text-xs text-primary hover:text-primary/80 hover:underline shrink-0"
          >
            View all
          </Link>
        </div>
        {needsFollowUp.length > 0 && (
          <p className="text-xs text-destructive mt-1">
            {needsFollowUp.length} need{needsFollowUp.length === 1 ? "s" : ""}{" "}
            follow-up
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px] px-6 pb-6">
          <div className="space-y-2">
            {items.map((item) => {
              const overdue =
                item.followUpDate &&
                new Date(item.followUpDate) <= startOfToday;

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 rounded-md p-2 -mx-2"
                >
                  <Clock
                    className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      overdue
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        from {item.person}
                      </span>
                      {item.followUpDate && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            overdue
                              ? "border-red-300 text-red-600 dark:border-red-500/30 dark:text-red-400"
                              : ""
                          }`}
                        >
                          {overdue
                            ? "Follow up now"
                            : `Follow up in ${daysUntil(item.followUpDate)}d`}
                        </Badge>
                      )}
                      {item.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          due {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
