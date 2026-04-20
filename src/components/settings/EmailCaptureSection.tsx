"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Mail,
  Copy,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Check,
} from "lucide-react";

interface EmailCaptureState {
  enabled: boolean;
  address: string | null;
  domain: string;
  configured: boolean;
}

export function EmailCaptureSection() {
  const [state, setState] = useState<EmailCaptureState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings/email-capture")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setState(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function doAction(action: "enable" | "disable" | "regenerate") {
    setActing(true);
    try {
      const res = await fetch("/api/settings/email-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data);
        if (action === "regenerate") {
          toast({ title: "Address regenerated", description: "Your old address has stopped working." });
        }
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    }
    setActing(false);
  }

  async function copyAddress() {
    if (!state?.address) return;
    await navigator.clipboard.writeText(state.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Email Capture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Email Capture
            </CardTitle>
            <CardDescription>
              Forward emails to your personal Tandem inbox address
            </CardDescription>
          </div>
          <Switch
            checked={state?.enabled ?? false}
            onCheckedChange={(checked) => doAction(checked ? "enable" : "disable")}
            disabled={acting || !state?.configured}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!state?.configured && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Email capture requires the <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">EMAIL_INBOX_DOMAIN</code> environment variable to be configured by your server operator.
            </p>
          </div>
        )}

        {state?.enabled && state.address && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Your inbox address
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate">
                  {state.address}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyAddress}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Forward any email to this address and it will appear in your Tandem inbox as an unprocessed item.
            </p>
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => doAction("regenerate")}
                disabled={acting}
                className="text-xs"
              >
                {acting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Regenerate Address
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">
                Creates a new address. The old one stops working immediately.
              </p>
            </div>
          </>
        )}

        {state?.enabled && !state.address && !state.configured && (
          <p className="text-sm text-muted-foreground">
            Email capture is enabled but no domain is configured. Contact your server operator.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
