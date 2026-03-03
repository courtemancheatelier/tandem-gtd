"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UsersRound, FolderKanban } from "lucide-react";
import { TeamIcon } from "./team-icons";

export interface TeamData {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  role: string;
  memberCount: number;
  projectCount: number;
  joinedAt: string;
  createdAt: string;
}

const roleBadgeColors: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  MEMBER: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export function TeamCard({ team }: { team: TeamData }) {
  return (
    <Link href={`/teams/${team.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TeamIcon icon={team.icon} className="h-4 w-4" />
              {team.name}
            </CardTitle>
            <Badge variant="secondary" className={roleBadgeColors[team.role] || ""}>
              {team.role}
            </Badge>
          </div>
          {team.description && (
            <p className="text-xs text-muted-foreground mt-1">{team.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UsersRound className="h-3 w-3" />
              {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {team.projectCount} project{team.projectCount !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
