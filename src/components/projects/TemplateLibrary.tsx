"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, Eye, EyeOff } from "lucide-react";
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
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  isHidden?: boolean;
}

interface TemplateLibraryProps {
  onSelect: (template: Template) => void;
}

export function TemplateLibrary({ onSelect }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [hiddenTemplates, setHiddenTemplates] = useState<Template[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  async function fetchTemplates() {
    try {
      const [visibleRes, hiddenRes] = await Promise.all([
        fetch("/api/project-templates"),
        fetch("/api/project-templates?showHidden=true"),
      ]);
      if (visibleRes.ok && hiddenRes.ok) {
        const visible: Template[] = await visibleRes.json();
        const all: Template[] = await hiddenRes.json();
        setTemplates(visible);
        // Hidden = in "all" but not in "visible"
        const visibleIds = new Set(visible.map((t) => t.id));
        setHiddenTemplates(
          all.filter((t) => !visibleIds.has(t.id)).map((t) => ({ ...t, isHidden: true }))
        );
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

  async function handleHide(e: React.MouseEvent, templateId: string) {
    e.stopPropagation();
    const res = await fetch(`/api/project-templates/${templateId}/hide`, {
      method: "POST",
    });
    if (res.ok) {
      const hidden = templates.find((t) => t.id === templateId);
      if (hidden) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        setHiddenTemplates((prev) => [...prev, { ...hidden, isHidden: true }]);
      }
    }
  }

  async function handleUnhide(e: React.MouseEvent, templateId: string) {
    e.stopPropagation();
    const res = await fetch(`/api/project-templates/${templateId}/hide`, {
      method: "DELETE",
    });
    if (res.ok) {
      const unhidden = hiddenTemplates.find((t) => t.id === templateId);
      if (unhidden) {
        setHiddenTemplates((prev) => prev.filter((t) => t.id !== templateId));
        setTemplates((prev) => [...prev, { ...unhidden, isHidden: false }]);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const myTemplates = templates.filter((t) => !t.isSystem && !t.teamId);
  const teamTemplates = templates.filter((t) => !t.isSystem && !!t.teamId);
  const systemTemplates = templates.filter((t) => t.isSystem);

  // Group team templates by team name
  const teamGroups = new Map<string, Template[]>();
  for (const t of teamTemplates) {
    const teamName = t.team?.name || "Unknown Team";
    if (!teamGroups.has(teamName)) teamGroups.set(teamName, []);
    teamGroups.get(teamName)!.push(t);
  }

  const hiddenSystemTemplates = hiddenTemplates.filter((t) => t.isSystem);
  const hiddenTeamTemplates = hiddenTemplates.filter((t) => !t.isSystem && !!t.teamId);
  const hasHidden = hiddenTemplates.length > 0;

  return (
    <div className="space-y-4">
      {hasHidden && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showHidden ? "Hide hidden" : "Show hidden"}
          </button>
        </div>
      )}

      {myTemplates.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            My Templates
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {myTemplates.map((t) => (
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

      {(teamGroups.size > 0 || (showHidden && hiddenTeamTemplates.length > 0)) && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Team Templates
          </h3>
          {Array.from(teamGroups.entries()).map(([teamName, teamTmpls]) => (
            <div key={teamName} className="mb-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{teamName}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {teamTmpls.map((t) => (
                  <div key={t.id} className="relative group">
                    <TemplateCard
                      template={t}
                      onClick={() => onSelect(t)}
                    />
                    <button
                      onClick={(e) => handleHide(e, t.id)}
                      className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-muted-foreground/60"
                      title="Hide template"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {showHidden && hiddenTeamTemplates.map((t) => (
            <div key={t.id} className="relative group mb-2">
              <TemplateCard
                template={t}
                onClick={() => onSelect(t)}
                isHidden
              />
              <button
                onClick={(e) => handleUnhide(e, t.id)}
                className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Unhide template"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(systemTemplates.length > 0 || (showHidden && hiddenSystemTemplates.length > 0)) && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            System Templates
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {systemTemplates.map((t) => (
              <div key={t.id} className="relative group">
                <TemplateCard
                  key={t.id}
                  template={t}
                  onClick={() => onSelect(t)}
                />
                <button
                  onClick={(e) => handleHide(e, t.id)}
                  className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-muted-foreground/60"
                  title="Hide template"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {showHidden && hiddenSystemTemplates.map((t) => (
              <div key={t.id} className="relative group">
                <TemplateCard
                  template={t}
                  onClick={() => onSelect(t)}
                  isHidden
                />
                <button
                  onClick={(e) => handleUnhide(e, t.id)}
                  className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  title="Unhide template"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && hiddenTemplates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No templates available yet. Save a project as a template to get
          started.
        </p>
      )}
    </div>
  );
}
