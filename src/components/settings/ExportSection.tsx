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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Download } from "lucide-react";

const SCOPE_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "tasks", label: "Tasks" },
  { value: "projects", label: "Projects" },
  { value: "inbox", label: "Inbox" },
  { value: "contexts", label: "Contexts" },
  { value: "areas", label: "Areas" },
  { value: "goals", label: "Goals" },
  { value: "horizons", label: "Horizon Notes" },
  { value: "wiki", label: "Wiki Articles" },
  { value: "routine-logs", label: "Routine Logs" },
] as const;

const CSV_SCOPES = new Set(["tasks", "projects", "routine-logs"]);

export function ExportSection() {
  const { toast } = useToast();
  const [format, setFormat] = React.useState("json");
  const [scope, setScope] = React.useState("all");
  const [includeCompleted, setIncludeCompleted] = React.useState(true);
  const [downloading, setDownloading] = React.useState(false);

  // When switching to CSV, ensure scope is valid for CSV
  const handleFormatChange = (value: string) => {
    setFormat(value);
    if (value === "csv" && !CSV_SCOPES.has(scope)) {
      setScope("tasks");
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const params = new URLSearchParams({
        format,
        scope,
        includeCompleted: String(includeCompleted),
      });

      const res = await fetch(`/api/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(data.error || "Export failed");
      }

      // Extract filename from Content-Disposition or build a default
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+?)"/);
      const filename =
        filenameMatch?.[1] ??
        `tandem-export-${scope}-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "json"}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: "Export downloaded", description: filename });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Export failed";
      toast({
        title: "Export failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const scopeOptions =
    format === "csv"
      ? SCOPE_OPTIONS.filter((o) => CSV_SCOPES.has(o.value))
      : SCOPE_OPTIONS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Download className="h-5 w-5" />
          Export Your Data
        </CardTitle>
        <CardDescription>
          Download a backup of your GTD data. JSON includes all data types; CSV
          is available for tasks and projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="export-format">Format</Label>
            <Select value={format} onValueChange={handleFormatChange}>
              <SelectTrigger id="export-format" className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-scope">Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="export-scope" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="include-completed"
            checked={includeCompleted}
            onCheckedChange={(v) => setIncludeCompleted(v === true)}
          />
          <Label htmlFor="include-completed" className="text-sm font-normal">
            Include completed items
          </Label>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleDownload} disabled={downloading}>
            <Download className="h-4 w-4 mr-1.5" />
            {downloading ? "Exporting..." : "Download Export"}
          </Button>
          <a
            href="/settings/import"
            className="text-sm text-muted-foreground hover:underline"
          >
            Import data instead
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
