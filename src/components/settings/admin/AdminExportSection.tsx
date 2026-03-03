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
import { useToast } from "@/components/ui/use-toast";
import { Download } from "lucide-react";

export function AdminExportSection() {
  const { toast } = useToast();
  const [downloading, setDownloading] = React.useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);

      const res = await fetch("/api/admin/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(data.error || "Export failed");
      }

      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+?)"/);
      const filename =
        filenameMatch?.[1] ??
        `tandem-server-export-${new Date().toISOString().slice(0, 10)}.json`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: "Server export downloaded", description: filename });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Download className="h-5 w-5" />
          Server Backup
        </CardTitle>
        <CardDescription>
          Export all users&apos; data as a single JSON file for backup or migration
          to another Tandem instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleDownload} disabled={downloading}>
          <Download className="h-4 w-4 mr-1.5" />
          {downloading ? "Exporting..." : "Download Server Export"}
        </Button>
      </CardContent>
    </Card>
  );
}
