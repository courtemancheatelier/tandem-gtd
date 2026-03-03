"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plane,
  UserPlus,
  Rocket,
  Home,
  ShoppingCart,
  FileText,
  ArrowRight,
  Layers,
  ListChecks,
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  plane: <Plane className="h-5 w-5" />,
  "user-plus": <UserPlus className="h-5 w-5" />,
  rocket: <Rocket className="h-5 w-5" />,
  home: <Home className="h-5 w-5" />,
  "shopping-cart": <ShoppingCart className="h-5 w-5" />,
};

const typeLabels: Record<string, string> = {
  SEQUENTIAL: "Sequential",
  PARALLEL: "Parallel",
  SINGLE_ACTIONS: "Single Actions",
};

const typeIcons: Record<string, React.ReactNode> = {
  SEQUENTIAL: <ArrowRight className="h-3 w-3" />,
  PARALLEL: <Layers className="h-3 w-3" />,
  SINGLE_ACTIONS: <ListChecks className="h-3 w-3" />,
};

interface TemplateCardProps {
  template: {
    id: string;
    title: string;
    description?: string | null;
    type: string;
    icon?: string | null;
    isSystem: boolean;
    variables: string[];
    _count: { taskTemplates: number; subProjectTemplates: number };
  };
  onClick: () => void;
}

export function TemplateCard({ template, onClick }: TemplateCardProps) {
  const icon = template.icon ? iconMap[template.icon] : <FileText className="h-5 w-5" />;
  const taskCount = template._count.taskTemplates;
  const subCount = template._count.subProjectTemplates;

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors p-4"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="text-muted-foreground mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">{template.title}</h3>
          {template.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs gap-1 py-0">
              {typeIcons[template.type]}
              {typeLabels[template.type]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {taskCount} task{taskCount !== 1 ? "s" : ""}
              {subCount > 0 && ` · ${subCount} sub-project${subCount !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
