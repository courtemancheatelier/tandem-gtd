"use client";

import { useParams, useSearchParams } from "next/navigation";
import { FlowView } from "@/components/flow/FlowView";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ProjectFlowPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const highlightTaskId = searchParams.get("task");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Project
        </Link>
      </div>
      <FlowView projectId={projectId} highlightTaskId={highlightTaskId} />
    </div>
  );
}
