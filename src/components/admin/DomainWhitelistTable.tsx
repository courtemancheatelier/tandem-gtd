"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Globe, Plus, Trash2 } from "lucide-react";

interface AllowedDomain {
  id: string;
  domain: string;
  tier: string;
  note: string | null;
  createdAt: string;
}

const tierColors: Record<string, string> = {
  ALPHA: "border-purple-400 text-purple-600 bg-purple-50",
  BETA: "border-blue-400 text-blue-600 bg-blue-50",
  GENERAL: "border-gray-400 text-gray-600 bg-gray-50",
  WAITLIST: "border-yellow-400 text-yellow-600 bg-yellow-50",
};

export function DomainWhitelistTable() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newTier, setNewTier] = useState("BETA");
  const [newNote, setNewNote] = useState("");

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/domains");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDomains(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load allowed domains",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  async function handleAdd() {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: newDomain.trim(),
          tier: newTier,
          note: newNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add domain");
      }
      const created = await res.json();
      setDomains((prev) => [created, ...prev]);
      setNewDomain("");
      setNewNote("");
      toast({ title: "Domain added" });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to add domain",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/domains/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setDomains((prev) => prev.filter((d) => d.id !== id));
      toast({ title: "Domain removed" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove domain",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              Domain Whitelist
              {domains.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {domains.length}
                </Badge>
              )}
              <ChevronDown
                className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${
                  open ? "rotate-0" : "-rotate-90"
                }`}
              />
            </CardTitle>
            <CardDescription>
              Email domains that bypass invite/waitlist requirements
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Add domain form */}
            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label htmlFor="new-domain" className="text-sm">Domain</Label>
                <Input
                  id="new-domain"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  disabled={adding}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Tier</Label>
                <Select value={newTier} onValueChange={setNewTier} disabled={adding}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALPHA">Alpha</SelectItem>
                    <SelectItem value="BETA">Beta</SelectItem>
                    <SelectItem value="GENERAL">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1 min-w-[150px]">
                <Label className="text-sm">Note (optional)</Label>
                <Input
                  placeholder="e.g. Partner org"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  disabled={adding}
                />
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding || !newDomain.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                {adding ? "Adding..." : "Add"}
              </Button>
            </div>

            {/* Domain list */}
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No whitelisted domains yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Domain</th>
                      <th className="pb-2 font-medium">Tier</th>
                      <th className="pb-2 font-medium">Note</th>
                      <th className="pb-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 font-mono">{d.domain}</td>
                        <td className="py-2">
                          <Badge
                            variant="outline"
                            className={`text-xs ${tierColors[d.tier] ?? ""}`}
                          >
                            {d.tier}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {d.note || "-"}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={deletingId === d.id}
                            onClick={() => handleDelete(d.id)}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
