"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Users } from "lucide-react";
import type { TeamMemberBreakdown } from "@/lib/flow/types";

interface FlowTeamBreakdownProps {
  members: TeamMemberBreakdown[];
}

export function FlowTeamBreakdown({ members }: FlowTeamBreakdownProps) {
  const [expanded, setExpanded] = useState(true);

  if (members.length === 0) return null;

  const sorted = [...members].sort(
    (a, b) => b.blockingOthersCount - a.blockingOthersCount
  );

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-lg font-semibold hover:text-primary transition-colors"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
        <Users className="h-4 w-4" />
        Team ({members.length})
      </button>

      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {sorted.map((member) => (
            <div
              key={member.userId}
              className="rounded-md border px-3 py-2 space-y-1"
            >
              <div className="text-sm font-medium truncate">{member.userName}</div>
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                <span className="text-green-600 dark:text-green-400">
                  {member.actionableCount} actionable
                </span>
                {member.blockedCount > 0 && (
                  <span className="text-yellow-600 dark:text-yellow-400">
                    {member.blockedCount} blocked
                  </span>
                )}
                {member.blockingOthersCount > 0 && (
                  <span className={cn(
                    "px-1.5 py-0 rounded-full font-medium",
                    "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  )}>
                    Blocking {member.blockingOthersCount}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
