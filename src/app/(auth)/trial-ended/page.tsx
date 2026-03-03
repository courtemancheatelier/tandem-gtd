"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
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
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  // Pre-fill email from session
  useEffect(() => {
    if (session?.user?.email && !email) {
      setEmail(session.user.email);
    }
  }, [session, email]);

  async function handleInterestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/trial/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubmitted(true);
      }
    } catch {
      // Silently fail
    } finally {
      setSubmitting(false);
    }
  }

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
            Your trial has ended
          </h1>
          <p className="text-muted-foreground text-lg">
            Thanks for trying Tandem!{" "}
            {trialStatus &&
              `You created ${trialStatus.stats.projects} project${trialStatus.stats.projects !== 1 ? "s" : ""} and ${trialStatus.stats.tasks} task${trialStatus.stats.tasks !== 1 ? "s" : ""} during your trial.`}
          </p>
          <p className="text-muted-foreground">
            Your data is safe. Choose how you&apos;d like to continue.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Managed hosting — Coming Soon */}
          <Card className="relative">
            <Badge
              variant="secondary"
              className="absolute top-4 right-4"
            >
              Coming Soon
            </Badge>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Keep Everything</CardTitle>
              </div>
              <CardDescription>
                Subscribe to managed hosting. We handle the server — you keep
                your data and get automatic updates.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-sm font-medium">
                    We&apos;ll notify you when managed hosting launches.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleInterestSubmit} className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Get notified when managed hosting is available.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Self-host */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Take Your Data Home</CardTitle>
              </div>
              <CardDescription>
                Self-host Tandem for free on your own hardware. Export your data
                and import it into your own instance.
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
              <a
                href={`${process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/courtemancheatelier/tandem-gtd"}#self-hosting`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-center text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                Self-hosting guide on GitHub
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
