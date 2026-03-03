"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { TemplateCard } from "./TemplateCard";

interface Template {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  icon?: string | null;
  isSystem: boolean;
  variables: string[];
  _count: { taskTemplates: number; subProjectTemplates: number };
}

interface TemplateLibraryProps {
  onSelect: (template: Template) => void;
}

export function TemplateLibrary({ onSelect }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchTemplates() {
    try {
      const res = await fetch("/api/project-templates");
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function handleDelete(e: React.MouseEvent, templateId: string) {
    e.stopPropagation();
    const res = await fetch(`/api/project-templates/${templateId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const systemTemplates = templates.filter((t) => t.isSystem);
  const userTemplates = templates.filter((t) => !t.isSystem);

  return (
    <div className="space-y-4">
      {systemTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            System Templates
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {systemTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onClick={() => onSelect(t)}
              />
            ))}
          </div>
        </div>
      )}

      {userTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            My Templates
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {userTemplates.map((t) => (
              <div key={t.id} className="relative group">
                <TemplateCard
                  template={t}
                  onClick={() => onSelect(t)}
                />
                <button
                  onClick={(e) => handleDelete(e, t.id)}
                  className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No templates available yet. Save a project as a template to get
          started.
        </p>
      )}
    </div>
  );
}
