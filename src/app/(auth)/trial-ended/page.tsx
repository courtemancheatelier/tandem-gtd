"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  Server,
  Mail,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface TrialStatus {
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  daysUsed: number;
  stats: {
    projects: number;
    tasks: number;
    inboxItems: number;
  };
}

export default function TrialEndedPage() {
  const [exporting, setExporting] = useState(false);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);

  useEffect(() => {
    fetch("/api/trial/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setTrialStatus(data);
      })
      .catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(
        "/api/export?format=json&scope=all&includeCompleted=true"
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tandem-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Keep using Tandem
          </h1>
          {trialStatus && (trialStatus.stats.projects > 0 || trialStatus.stats.tasks > 0) && (
            <p className="text-muted-foreground text-lg">
              You&apos;ve captured {trialStatus.stats.tasks} task{trialStatus.stats.tasks !== 1 ? "s" : ""} and set up {trialStatus.stats.projects} project{trialStatus.stats.projects !== 1 ? "s" : ""} during your trial.
              Don&apos;t lose your momentum.
            </p>
          )}
          <p className="text-muted-foreground">
            Either way, your data is always yours. Export anytime, import anywhere.
          </p>
          <p className="text-sm text-muted-foreground">
            Choose the option that fits your situation:
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Managed hosting */}
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Managed Hosting</CardTitle>
              </div>
              <CardDescription>
                We handle the server, updates, and backups &mdash; you keep
                your data and your momentum. This is exactly what you&apos;ve
                been using during your trial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                From <strong>$1,000/year</strong> (flat-fee, not per-seat).
                Nonprofits: <strong>$500/year</strong>.
              </p>
              <Button className="w-full" asChild>
                <a
                  href="https://manage.tandemgtd.com/checkout"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Choose a plan
                  <ArrowRight className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Self-host */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Self-Host</CardTitle>
              </div>
              <CardDescription>
                You want full control and don&apos;t mind managing a server.
                Export your data and deploy Tandem on your own infrastructure &mdash; free forever.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export all data as JSON
              </Button>
              <div className="flex justify-center gap-4 text-sm">
                <a
                  href={`${process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/courtemancheatelier/tandem-gtd"}#self-hosting`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Self-hosting guide
                </a>
                <a
                  href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/courtemancheatelier/tandem-gtd"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  GitHub repo
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Button
            variant="ghost"
            className="text-sm text-muted-foreground"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
