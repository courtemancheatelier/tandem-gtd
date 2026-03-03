"use client";

import { Badge } from "@/components/ui/badge";
import { Tag, X } from "lucide-react";

interface WikiTagBadgeProps {
  tag: string;
  active?: boolean;
  removable?: boolean;
  onClick?: (tag: string) => void;
  onRemove?: (tag: string) => void;
}

export function WikiTagBadge({
  tag,
  active = false,
  removable = false,
  onClick,
  onRemove,
}: WikiTagBadgeProps) {
  return (
    <Badge
      variant={active ? "default" : "secondary"}
      className={`gap-1 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick ? () => onClick(tag) : undefined}
    >
      <Tag className="h-3 w-3" />
      {tag}
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="ml-0.5 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
