"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { ImportUploadStep } from "@/components/import/ImportUploadStep";
import { ImportMappingStep } from "@/components/import/ImportMappingStep";
import { ImportPreviewStep } from "@/components/import/ImportPreviewStep";
import { ImportProgressStep } from "@/components/import/ImportProgressStep";
import { ImportCompleteStep } from "@/components/import/ImportCompleteStep";
import type { ImportPreview } from "@/lib/import/types";
import { HelpLink } from "@/components/shared/HelpLink";

type Step = "upload" | "mapping" | "preview" | "progress" | "complete";

export default function ImportPage() {
  const [step, setStep] = React.useState<Step>("upload");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);

  const handleUploaded = (id: string, previewData: unknown) => {
    setJobId(id);
    setPreview(previewData as ImportPreview);
    setStep("preview");
  };

  const handleNeedsMapping = (id: string, headers: string[]) => {
    setJobId(id);
    setCsvHeaders(headers);
    setStep("mapping");
  };

  const handleMapped = (_id: string, previewData: unknown) => {
    setPreview(previewData as ImportPreview);
    setStep("preview");
  };

  const handleConfirmed = () => {
    setStep("progress");
  };

  const handleProgressComplete = React.useCallback(() => {
    setStep("complete");
  }, []);

  const handleCancelled = () => {
    setStep("upload");
    setJobId(null);
    setPreview(null);
    setCsvHeaders([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <a
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </a>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Import Data
          <HelpLink slug="import-export" />
        </h1>
        <p className="text-muted-foreground mt-1">
          Import data from a backup or another tool.
        </p>
      </div>

      {step === "upload" && (
        <ImportUploadStep
          onUploaded={handleUploaded}
          onNeedsMapping={handleNeedsMapping}
        />
      )}

      {step === "mapping" && jobId && (
        <ImportMappingStep
          jobId={jobId}
          headers={csvHeaders}
          onMapped={handleMapped}
          onCancelled={handleCancelled}
        />
      )}

      {step === "preview" && jobId && preview && (
        <ImportPreviewStep
          jobId={jobId}
          preview={preview}
          onConfirmed={handleConfirmed}
          onCancelled={handleCancelled}
        />
      )}

      {step === "progress" && jobId && (
        <ImportProgressStep
          jobId={jobId}
          onComplete={handleProgressComplete}
        />
      )}

      {step === "complete" && jobId && (
        <ImportCompleteStep jobId={jobId} />
      )}
    </div>
  );
}
