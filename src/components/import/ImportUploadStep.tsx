"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload } from "lucide-react";

interface ImportUploadStepProps {
  onUploaded: (jobId: string, preview: unknown) => void;
  onNeedsMapping?: (jobId: string, headers: string[]) => void;
}

export function ImportUploadStep({ onUploaded, onNeedsMapping }: ImportUploadStepProps) {
  const [source, setSource] = React.useState("tandem_json");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", source);

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Generic CSV needs a mapping step first
      if (data.status === "AWAITING_MAPPING" && data.headers && onNeedsMapping) {
        onNeedsMapping(data.id, data.headers);
        return;
      }

      onUploaded(data.id, data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Upload className="h-5 w-5" />
          Import Data
        </CardTitle>
        <CardDescription>
          Upload a file to import into your Tandem account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source selection */}
        <div className="space-y-2">
          <Label>Source</Label>
          <div className="flex gap-4">
            {[
              { value: "tandem_json", label: "Tandem JSON" },
              { value: "todoist_csv", label: "Todoist CSV" },
              { value: "generic_csv", label: "Generic CSV" },
            ].map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="source"
                  value={opt.value}
                  checked={source === opt.value}
                  onChange={() => setSource(opt.value)}
                  className="accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* File drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center transition-colors hover:border-muted-foreground/50"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={source === "tandem_json" ? ".json" : ".csv"}
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <div className="space-y-1">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Drop a file here or click to browse
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button onClick={handleUpload} disabled={!file || uploading}>
          {uploading ? "Uploading..." : "Upload & Preview"}
        </Button>
      </CardContent>
    </Card>
  );
}
