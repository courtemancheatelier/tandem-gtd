"use client";

import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  ListChecks,
  FileCode,
  Link,
  Image,
  Table,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { toolbarActions, type ToolbarAction } from "@/lib/hooks/use-markdown-toolbar";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  ListChecks,
  FileCode,
  Link,
  Image,
  Table,
  BookOpen,
};

interface MarkdownToolbarProps {
  onAction: (actionId: string) => void;
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace("Cmd", "⌘")
    .replace("Shift", "⇧")
    .replace("+", "");
}

function ToolbarButton({ action, onAction }: { action: ToolbarAction; onAction: (id: string) => void }) {
  const Icon = iconMap[action.icon];
  if (!Icon) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onAction(action.id)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {action.label}
          {action.shortcut && (
            <span className="ml-2 text-muted-foreground">
              {formatShortcut(action.shortcut)}
            </span>
          )}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function MarkdownToolbar({ onAction }: MarkdownToolbarProps) {
  const groups = ["inline", "heading", "block", "insert"] as const;
  const grouped = groups.map((g) => toolbarActions.filter((a) => a.group === g));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-input bg-background px-1 py-1">
        {grouped.map((actions, groupIdx) => (
          <div key={groupIdx} className="flex items-center">
            {groupIdx > 0 && <Separator orientation="vertical" className="mx-1 h-6" />}
            {actions.map((action) => (
              <ToolbarButton key={action.id} action={action} onAction={onAction} />
            ))}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
