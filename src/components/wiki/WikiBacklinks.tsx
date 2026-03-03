"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Link2 } from "lucide-react";

interface Backlink {
  id: string;
  slug: string;
  title: string;
  updatedAt: string;
}

interface WikiBacklinksProps {
  slug: string;
  teamId?: string | null;
}

export function WikiBacklinks({ slug, teamId }: WikiBacklinksProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchBacklinks() {
      try {
        const teamParam = teamId ? `?teamId=${teamId}` : "";
        const res = await fetch(`/api/wiki/${slug}/backlinks${teamParam}`);
        if (res.ok && !cancelled) {
          setBacklinks(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBacklinks();
    return () => { cancelled = true; };
  }, [slug, teamId]);

  if (loading || backlinks.length === 0) return null;

  const linkParam = teamId ? `?teamId=${teamId}` : "";

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Link2 className="h-4 w-4" />
        Backlinks ({backlinks.length})
      </h3>
      <div className="grid gap-1">
        {backlinks.map((bl) => (
          <Link
            key={bl.id}
            href={`/wiki/${bl.slug}${linkParam}`}
            className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent/50 transition-colors group"
          >
            <span className="font-medium">{bl.title}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {new Date(bl.updatedAt).toLocaleDateString()}
              <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
