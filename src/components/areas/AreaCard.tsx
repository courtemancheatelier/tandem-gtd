"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderKanban, Target, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AreaData {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  projectCount: number;
  activeProjectCount: number;
  goalCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AreaCardProps {
  area: AreaData;
  onToggleActive: (id: string, isActive: boolean) => void;
  onEdit: (area: AreaData) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function AreaCard({
  area,
  onToggleActive,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: AreaCardProps) {
  return (
    <Card
      className={cn(
        "transition-colors",
        !area.isActive && "opacity-60"
      )}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CardTitle className="text-sm font-medium truncate">
              {area.name}
            </CardTitle>
            <Badge
              variant={area.isActive ? "default" : "outline"}
              className={cn(
                "shrink-0 text-xs",
                area.isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : ""
              )}
            >
              {area.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <div className="flex items-center gap-0.5 mr-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onMoveUp(area.id)}
                disabled={isFirst}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onMoveDown(area.id)}
                disabled={isLast}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggleActive(area.id, !area.isActive)}
              title={area.isActive ? "Deactivate" : "Activate"}
            >
              <div
                className={cn(
                  "h-3 w-3 rounded-full border-2",
                  area.isActive
                    ? "bg-green-500 border-green-600"
                    : "bg-transparent border-muted-foreground"
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(area)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(area.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {(area.description || area.activeProjectCount > 0 || area.goalCount > 0) && (
        <CardContent className="pt-0 px-4 pb-3">
          {area.description && (
            <p className="text-xs text-muted-foreground mb-2">
              {area.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {area.activeProjectCount} active project{area.activeProjectCount !== 1 ? "s" : ""}
              {area.projectCount > area.activeProjectCount && (
                <span className="text-muted-foreground/60">
                  ({area.projectCount} total)
                </span>
              )}
            </span>
            {area.goalCount > 0 && (
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {area.goalCount} goal{area.goalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
