"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, Link2, Unlink, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";

interface LinkedAccount {
  id: string;
  provider: string;
  createdAt: string;
}

interface ConfiguredProviders {
  google: boolean;
  apple: boolean;
  github: boolean;
  microsoft: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  "azure-ad": "Microsoft",
};

const PROVIDER_IDS: Record<string, string> = {
  google: "google",
  apple: "apple",
  github: "github",
  microsoft: "azure-ad",
};

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" className="shrink-0">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      );
    case "apple":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="shrink-0">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="shrink-0">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      );
    case "azure-ad":
      return (
        <svg viewBox="0 0 23 23" width="20" height="20" className="shrink-0">
          <rect x="1" y="1" width="10" height="10" fill="#f25022" />
          <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
          <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
          <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
        </svg>
      );
    default:
      return <Link2 className="h-5 w-5 shrink-0" />;
  }
}

export default function LinkedAccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<ConfiguredProviders>({
    google: false,
    apple: false,
    github: false,
    microsoft: false,
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/linked-accounts");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAccounts(data);
    } catch {
      toast({ title: "Error", description: "Failed to load linked accounts", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAccounts();
    fetch("/api/auth/registration-mode")
      .then((res) => res.json())
      .then((data) => {
        if (data.providers) setConfiguredProviders(data.providers);
      })
      .catch(() => {});
  }, [fetchAccounts]);

  async function handleRemove(accountId: string) {
    if (!window.confirm("Remove this linked account? You can re-link it later.")) return;
    setRemoving(accountId);
    try {
      const res = await fetch(`/api/settings/linked-accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to remove account");
      }
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      toast({ title: "Account removed" });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to remove account",
        variant: "destructive",
      });
    } finally {
      setRemoving(null);
    }
  }

  async function handleLink(providerKey: string) {
    const providerId = PROVIDER_IDS[providerKey];
    if (!providerId) return;
    setLinking(providerKey);
    try {
      // Set the linking cookie then redirect to OAuth
      await fetch("/api/auth/set-linking-flag", { method: "POST" });
      signIn(providerId, { callbackUrl: "/settings/linked-accounts" });
    } catch {
      toast({ title: "Error", description: "Failed to start linking flow", variant: "destructive" });
      setLinking(null);
    }
  }

  const linkedProviders = new Set(accounts.map((a) => a.provider));

  // Map configured providers to their provider IDs for comparison
  const unlinkableProviders = Object.entries(configuredProviders)
    .filter(([, enabled]) => enabled)
    .map(([key]) => ({ key, id: PROVIDER_IDS[key] }))
    .filter(({ id }) => id && !linkedProviders.has(id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            Linked Accounts
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage the OAuth providers linked to your account
          </p>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Linked Providers</CardTitle>
          <CardDescription>
            These are the sign-in methods currently connected to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No OAuth accounts linked.</p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <ProviderIcon provider={account.provider} />
                    <div>
                      <p className="font-medium text-sm">
                        {PROVIDER_LABELS[account.provider] || account.provider}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Linked {new Date(account.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(account.id)}
                    disabled={removing === account.id || accounts.length <= 1}
                    className="gap-1 text-destructive hover:text-destructive"
                  >
                    {removing === account.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {unlinkableProviders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Link Another Provider</CardTitle>
            <CardDescription>
              Add additional sign-in methods to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unlinkableProviders.map(({ key, id }) => (
                <Button
                  key={key}
                  variant="outline"
                  className="w-full justify-start gap-3"
                  onClick={() => handleLink(key)}
                  disabled={linking === key}
                >
                  {linking === key ? (
                    <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  ) : (
                    <ProviderIcon provider={id} />
                  )}
                  Link {PROVIDER_LABELS[id] || key}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
