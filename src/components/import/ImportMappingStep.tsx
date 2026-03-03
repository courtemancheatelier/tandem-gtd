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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TANDEM_FIELDS = [
  { value: "_skip", label: "(skip)" },
  { value: "title", label: "Title" },
  { value: "notes", label: "Notes" },
  { value: "status", label: "Status" },
  { value: "projectTitle", label: "Project" },
  { value: "contextName", label: "Context" },
  { value: "dueDate", label: "Due Date" },
  { value: "energyLevel", label: "Energy Level" },
  { value: "estimatedMins", label: "Estimated Minutes" },
];

interface ImportMappingStepProps {
  jobId: string;
  headers: string[];
  onMapped: (jobId: string, preview: unknown) => void;
  onCancelled: () => void;
}

export function ImportMappingStep({
  jobId,
  headers,
  onMapped,
  onCancelled,
}: ImportMappingStepProps) {
  const [mapping, setMapping] = React.useState<Record<string, string>>(() => {
    // Auto-detect common column names
    const initial: Record<string, string> = {};
    for (const header of headers) {
      const lower = header.toLowerCase().trim();
      if (lower === "title" || lower === "name" || lower === "task") {
        initial[header] = "title";
      } else if (lower === "notes" || lower === "description") {
        initial[header] = "notes";
      } else if (lower === "status") {
        initial[header] = "status";
      } else if (lower === "project") {
        initial[header] = "projectTitle";
      } else if (lower === "context" || lower === "label" || lower === "labels") {
        initial[header] = "contextName";
      } else if (lower === "due" || lower === "due date" || lower === "duedate" || lower === "due_date") {
        initial[header] = "dueDate";
      } else if (lower === "energy" || lower === "energylevel" || lower === "energy_level" || lower === "priority") {
        initial[header] = "energyLevel";
      } else if (lower === "time" || lower === "minutes" || lower === "estimatedmins" || lower === "estimated_mins") {
        initial[header] = "estimatedMins";
      } else {
        initial[header] = "_skip";
      }
    }
    return initial;
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasTitleMapping = Object.values(mapping).includes("title");

  const handleSubmit = async () => {
    if (!hasTitleMapping) return;

    // Build clean mapping (exclude skipped columns)
    const cleanMapping: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field && field !== "_skip") {
        cleanMapping[col] = field;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/import/${jobId}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: cleanMapping }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Mapping failed");
      }

      onMapped(data.id, data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mapping failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Map Columns</CardTitle>
        <CardDescription>
          Map each CSV column to a Tandem field. At minimum, map one column to
          &ldquo;Title&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {headers.map((header) => (
            <div key={header} className="flex items-center gap-3">
              <Label className="w-40 truncate text-sm font-mono" title={header}>
                {header}
              </Label>
              <Select
                value={mapping[header] || "_skip"}
                onValueChange={(v) =>
                  setMapping((prev) => ({ ...prev, [header]: v }))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TANDEM_FIELDS.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {!hasTitleMapping && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            You must map at least one column to &ldquo;Title&rdquo;.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancelled} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasTitleMapping || submitting}
          >
            {submitting ? "Applying..." : "Apply Mapping & Preview"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
