"use client";

import { useParams } from "next/navigation";
import { ComplianceDashboard } from "@/components/routines/ComplianceDashboard";

export default function CompliancePage() {
  const params = useParams();
  const routineId = params.id as string;

  return <ComplianceDashboard routineId={routineId} />;
}
