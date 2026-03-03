"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

export interface TeamMemberData {
  id: string;
  role: string;
  label?: string | null;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface TeamMemberListProps {
  members: TeamMemberData[];
  isAdmin: boolean;
  currentUserId: string;
  onRoleChange?: (userId: string, role: string) => void;
  onRemove?: (userId: string) => void;
}

const roleBadgeColors: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  MEMBER: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export function TeamMemberList({
  members,
  isAdmin,
  currentUserId,
  onRoleChange,
  onRemove,
}: TeamMemberListProps) {
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center justify-between py-2 px-3 rounded-md border"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              {member.user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium">
                {member.user.name}
                {member.user.id === currentUserId && (
                  <span className="text-muted-foreground ml-1">(you)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{member.user.email}</p>
            </div>
            {member.label && (
              <Badge variant="outline" className="text-xs">
                {member.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && onRoleChange ? (
              <Select
                value={member.role}
                onValueChange={(v) => onRoleChange(member.user.id, v)}
              >
                <SelectTrigger className="w-24 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary" className={roleBadgeColors[member.role] || ""}>
                {member.role}
              </Badge>
            )}
            {(isAdmin || member.user.id === currentUserId) && onRemove && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(member.user.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
