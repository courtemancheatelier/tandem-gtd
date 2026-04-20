import { Suspense } from "react";
import { DriftDashboard } from "@/components/drift/DriftDashboard";

export default function DriftPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    }>
      <DriftDashboard />
    </Suspense>
  );
}
