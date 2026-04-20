"use client";

interface DelegationBadgeProps {
  delegatorName: string;
  status?: string;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  VIEWED: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  COMPLETED: "bg-gray-100 text-gray-600",
  DECLINED: "bg-red-100 text-red-800",
  RECALLED: "bg-gray-100 text-gray-600",
};

export function DelegationBadge({ delegatorName, status }: DelegationBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span>📨</span>
      <span>Delegated by {delegatorName}</span>
      {status && (
        <span
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
            statusColors[status] || "bg-gray-100 text-gray-600"
          }`}
        >
          {status}
        </span>
      )}
    </span>
  );
}
