"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, AlertTriangle, CheckCircle2, XCircle, SkipForward, Copy, ChevronDown } from "lucide-react";

interface UserImportResult {
  email: string;
  status: "created" | "skipped" | "error";
  tempPassword?: string;
  createdItems?: number;
  skippedItems?: number;
  errorCount?: number;
  error?: string;
}

interface ServerImportResult {
  totalUsers: number;
  createdUsers: number;
  skippedUsers: number;
  errorUsers: number;
  users: UserImportResult[];
}

export function AdminImportSection() {
  const { toast } = useToast();
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<ServerImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a server export JSON file.",
        variant: "destructive",
      });
      return;
    }

    try {
      setImporting(true);
      setResult(null);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setResult(data as ServerImportResult);
      toast({
        title: "Import complete",
        description: `${data.createdUsers} user(s) created, ${data.skippedUsers} skipped.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const hasNewUsers = result?.users.some((u) => u.status === "created") ?? false;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" />
              Server Restore
              <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
            </CardTitle>
            <CardDescription>
              Import users and their data from a server export JSON file. Existing
              users (by email) will be skipped.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
              />
              <Button onClick={handleImport} disabled={importing}>
                <Upload className="h-4 w-4 mr-1.5" />
                {importing ? "Importing..." : "Import"}
              </Button>
            </div>

            {result && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="flex gap-4 text-sm">
                  <span>
                    Total: <strong>{result.totalUsers}</strong>
                  </span>
                  <span className="text-green-600">
                    Created: <strong>{result.createdUsers}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Skipped: <strong>{result.skippedUsers}</strong>
                  </span>
                  {result.errorUsers > 0 && (
                    <span className="text-red-600">
                      Errors: <strong>{result.errorUsers}</strong>
                    </span>
                  )}
                </div>

                {/* Security warning for temp passwords */}
                {hasNewUsers && (
                  <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                      Temporary passwords are shown below. Copy them now — they
                      cannot be retrieved later. Users should change their password
                      on first login.
                    </p>
                  </div>
                )}

                {/* Per-user results */}
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Email</th>
                        <th className="text-left px-3 py-2 font-medium">Items</th>
                        <th className="text-left px-3 py-2 font-medium">
                          Temp Password
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.users.map((u) => (
                        <tr key={u.email} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="px-3 py-2">
                            {u.status === "created" && (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                            {u.status === "skipped" && (
                              <SkipForward className="h-4 w-4 text-muted-foreground" />
                            )}
                            {u.status === "error" && (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {u.email}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {u.status === "created" && (
                              <>
                                {u.createdItems} created
                                {(u.errorCount ?? 0) > 0 && (
                                  <span className="text-red-600 ml-1">
                                    ({u.errorCount} errors)
                                  </span>
                                )}
                              </>
                            )}
                            {u.status === "skipped" && "Already exists"}
                            {u.status === "error" && (
                              <span className="text-red-600">{u.error}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {u.tempPassword && (
                              <button
                                onClick={() => copyToClipboard(u.tempPassword!)}
                                className="inline-flex items-center gap-1 font-mono text-xs bg-muted px-2 py-1 rounded hover:bg-muted/80"
                              >
                                {u.tempPassword}
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
