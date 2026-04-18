"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export interface ProjectTreeNode {
  id: string;
  title: string;
  status: string;
  type: string;
  rollupProgress?: number | null;
  taskCounts?: { total: number; completed: number };
  children?: ProjectTreeNode[];
}

interface ProjectTreeViewProps {
  projects: ProjectTreeNode[];
  onSelect?: (projectId: string) => void;
  className?: string;
}

const statusDotColor: Record<string, string> = {
  ACTIVE: "bg-green-500",
  ON_HOLD: "bg-yellow-500",
  COMPLETED: "bg-blue-500",
  DROPPED: "bg-gray-400",
  SOMEDAY_MAYBE: "bg-purple-400",
};

function ProjectTreeNodeRow({
  node,
  depth,
  expandedIds,
  onToggle,
  onSelect,
}: {
  node: ProjectTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const progress = node.rollupProgress ?? (
    node.taskCounts && node.taskCounts.total > 0
      ? (node.taskCounts.completed / node.taskCounts.total) * 100
      : 0
  );

  return (
    <>
      <div
        className="flex items-center h-9 group hover:bg-muted/50 rounded-md transition-colors"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        {/* Expand/collapse chevron */}
        <button
          className={cn(
            "flex items-center justify-center h-5 w-5 shrink-0 mr-1",
            !hasChildren && "invisible"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </button>

        {/* Status dot */}
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0 mr-2",
            statusDotColor[node.status] ?? "bg-gray-400"
          )}
        />

        {/* Title */}
        <Link
          href={`/projects/${node.id}`}
          className="text-sm font-medium truncate flex-1 hover:underline"
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault();
              onSelect(node.id);
            }
          }}
        >
          {node.title}
        </Link>

        {/* Progress bar */}
        <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden shrink-0 mx-2">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Task count */}
        {node.taskCounts && (
          <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
            {node.taskCounts.completed}/{node.taskCounts.total}
          </span>
        )}
      </div>

      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <>
          {node.children!.map((child) => (
            <ProjectTreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </>
  );
}

export function ProjectTreeView({
  projects,
  onSelect,
  className,
}: ProjectTreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return new Set(projects.map((p) => p.id));
  });

  function handleToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className={cn("space-y-0.5", className)}>
      {projects.map((project) => (
        <ProjectTreeNodeRow
          key={project.id}
          node={project}
          depth={0}
          expandedIds={expandedIds}
          onToggle={handleToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
