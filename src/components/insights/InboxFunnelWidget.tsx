"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

interface InboxFunnelData {
  actionable: number;
  someday: number;
  reference: number;
  trash: number;
  totalProcessed: number;
  pending: number;
}

function StatCard({
  label,
  value,
  percentage,
  color,
}: {
  label: string;
  value: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="rounded-md border p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">
        {label}
        {percentage > 0 && (
          <span className="ml-1">({percentage}%)</span>
        )}
      </div>
    </div>
  );
}

export function InboxFunnelWidget({ data }: { data: InboxFunnelData }) {
  const total = data.totalProcessed;

  const pct = (n: number) =>
    total > 0 ? Math.round((n / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Inbox Funnel</CardTitle>
            <CardDescription>How inbox items were processed</CardDescription>
          </div>
          <Link href="/inbox" className="text-right hover:opacity-80 transition-opacity">
            <p className="text-2xl font-bold text-primary">{data.pending}</p>
            <p className="text-xs text-muted-foreground underline">pending</p>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No processed inbox items yet
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="Actionable"
              value={data.actionable}
              percentage={pct(data.actionable)}
              color="text-primary"
            />
            <StatCard
              label="Someday"
              value={data.someday}
              percentage={pct(data.someday)}
              color="text-blue-500"
            />
            <StatCard
              label="Reference"
              value={data.reference}
              percentage={pct(data.reference)}
              color="text-amber-500"
            />
            <StatCard
              label="Trash"
              value={data.trash}
              percentage={pct(data.trash)}
              color="text-muted-foreground"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
