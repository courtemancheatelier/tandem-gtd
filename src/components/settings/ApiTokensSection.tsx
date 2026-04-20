"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Key, ChevronDown, Plus, Trash2, Copy, AlertTriangle } from "lucide-react";

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsed: string | null;
  createdAt: string;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ApiTokensSection() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [apiEnabled, setApiEnabled] = React.useState<boolean | null>(null);
  const [tokens, setTokens] = React.useState<ApiToken[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createScopeRead, setCreateScopeRead] = React.useState(true);
  const [createScopeWrite, setCreateScopeWrite] = React.useState(true);
  const [createExpiry, setCreateExpiry] = React.useState("none");
  const [creating, setCreating] = React.useState(false);
  const [createdPlaintext, setCreatedPlaintext] = React.useState<string | null>(null);

  // Revoke dialog state
  const [revokeToken, setRevokeToken] = React.useState<ApiToken | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  const fetchFeatures = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/settings/features");
      if (!res.ok) throw new Error("Failed to load feature flags");
      const data = await res.json();
      setApiEnabled(data.apiAccessEnabled);
      if (data.apiAccessEnabled) {
        await fetchTokens();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load settings";
      setError(message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const fetchTokens = async () => {
    try {
      const res = await fetch("/api/settings/api-tokens");
      if (!res.ok) throw new Error("Failed to load tokens");
      const data = await res.json();
      setTokens(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load tokens";
      setError(message);
    }
  };

  const handleCreate = async () => {
    const scopes: string[] = [];
    if (createScopeRead) scopes.push("read");
    if (createScopeWrite) scopes.push("write");
    if (scopes.length === 0) {
      toast({ title: "Error", description: "Select at least one scope.", variant: "destructive" });
      return;
    }

    try {
      setCreating(true);
      const body: Record<string, unknown> = { name: createName, scopes };
      if (createExpiry !== "none") {
        body.expiresInDays = Number(createExpiry);
      }
      const res = await fetch("/api/settings/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create token");
      }
      const data = await res.json();
      setCreatedPlaintext(data.plaintext);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create token";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateDialogClose = (isOpen: boolean) => {
    if (!isOpen) {
      setCreateName("");
      setCreateScopeRead(true);
      setCreateScopeWrite(true);
      setCreateExpiry("none");
      setCreatedPlaintext(null);
      setCreating(false);
      fetchTokens();
    }
    setCreateOpen(isOpen);
  };

  const handleRevoke = async () => {
    if (!revokeToken) return;
    try {
      setRevoking(true);
      const res = await fetch(`/api/settings/api-tokens/${revokeToken.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke token");
      }
      setTokens((prev) => prev.filter((t) => t.id !== revokeToken.id));
      toast({ title: "Token revoked", description: `"${revokeToken.name}" has been revoked.` });
      setRevokeToken(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke token";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Token copied to clipboard." });
    } catch {
      toast({ title: "Error", description: "Failed to copy to clipboard.", variant: "destructive" });
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5" />
              API Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading API token settings...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error && apiEnabled === null) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5" />
              API Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-destructive">
              {error}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Feature disabled
  if (!apiEnabled) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5" />
              API Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              API access is disabled by your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card>
          <CollapsibleTrigger className="w-full text-left">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="h-5 w-5" />
                API Tokens
                <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
              </CardTitle>
              <CardDescription>
                Create and manage personal API tokens for the REST API.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Token list */}
              {tokens.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No API tokens yet
                </p>
              ) : (
                <div className="space-y-3">
                  {tokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex items-center justify-between gap-4 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{token.name}</span>
                          <code className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            {token.prefix}...
                          </code>
                          {token.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Created {formatRelativeDate(token.createdAt)}</span>
                          <span>
                            Last used: {token.lastUsed ? formatRelativeDate(token.lastUsed) : "Never"}
                          </span>
                          {token.expiresAt && (
                            <span>
                              Expires {new Date(token.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRevokeToken(token)}
                        title="Revoke token"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Create button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Token
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Create Token Dialog */}
      <Dialog open={createOpen} onOpenChange={handleCreateDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createdPlaintext ? "Token Created" : "Create API Token"}
            </DialogTitle>
            <DialogDescription>
              {createdPlaintext
                ? "Copy this token now — you won't see it again."
                : "Create a personal access token for the REST API."}
            </DialogDescription>
          </DialogHeader>

          {createdPlaintext ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdPlaintext}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(createdPlaintext)}
                  title="Copy token"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Make sure to copy your personal access token now. You won&apos;t be able to see it again.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  placeholder="e.g. Claude Desktop, Shortcuts"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="scope-read"
                      checked={createScopeRead}
                      onCheckedChange={(v) => setCreateScopeRead(v === true)}
                    />
                    <Label htmlFor="scope-read" className="text-sm font-normal">
                      Read
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="scope-write"
                      checked={createScopeWrite}
                      onCheckedChange={(v) => setCreateScopeWrite(v === true)}
                    />
                    <Label htmlFor="scope-write" className="text-sm font-normal">
                      Write
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="token-expiry">Expiration</Label>
                <Select value={createExpiry} onValueChange={setCreateExpiry}>
                  <SelectTrigger id="token-expiry" className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No expiration</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">365 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!createdPlaintext && (
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
              >
                {creating ? "Creating..." : "Create Token"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog open={!!revokeToken} onOpenChange={(isOpen) => { if (!isOpen) setRevokeToken(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke token</DialogTitle>
            <DialogDescription>
              Revoke &ldquo;{revokeToken?.name}&rdquo;? Any integrations using this token will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeToken(null)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
