"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, PackagePlus } from "lucide-react";

interface PackMeta {
  id: string;
  name: string;
  description: string;
  templateCount: number;
  preview: string[];
}

interface TemplatePackCardProps {
  pack: PackMeta;
  onLoaded: () => void;
}

export function TemplatePackCard({ pack, onLoaded }: TemplatePackCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-templates/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to load pack");
      }

      const data = await res.json();
      toast({
        title: "Pack loaded",
        description: data.message,
      });
      onLoaded();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load pack",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{pack.name}</CardTitle>
        <CardDescription>{pack.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {pack.templateCount} templates &middot;{" "}
          {pack.preview.join(", ")}
          {pack.templateCount > pack.preview.length ? ", ..." : ""}
        </p>
        <Button size="sm" onClick={handleLoad} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PackagePlus className="h-4 w-4 mr-2" />
          )}
          {loading ? "Loading..." : "Load Pack"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TemplatePackSection — fetches packs and renders a grid of cards.
// Reused in both RecurringTemplateList and CardFileView empty states.
// ---------------------------------------------------------------------------

interface TemplatePackSectionProps {
  onLoaded: () => void;
}

export function TemplatePackSection({ onLoaded }: TemplatePackSectionProps) {
  const [packs, setPacks] = useState<PackMeta[] | null>(null);

  // Lazy-fetch on first render
  useState(() => {
    fetch("/api/recurring-templates/packs")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPacks)
      .catch(() => setPacks([]));
  });

  if (!packs || packs.length === 0) return null;

  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex-1 border-t" />
        <span>or start with a template pack</span>
        <div className="flex-1 border-t" />
      </div>
      {packs.map((pack) => (
        <TemplatePackCard key={pack.id} pack={pack} onLoaded={onLoaded} />
      ))}
    </div>
  );
}
