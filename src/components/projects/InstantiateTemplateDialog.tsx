"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface TaskTemplate {
  id: string;
  title: string;
  sortOrder: number;
  subProjectTemplateId?: string | null;
}

interface SubProjectTemplate {
  id: string;
  title: string;
  type: string;
  sortOrder: number;
  tasks: TaskTemplate[];
}

interface TemplateDetail {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  outcome?: string | null;
  variables: string[];
  sourceFile?: string | null;
  teamId?: string | null;
  taskTemplates: TaskTemplate[];
  subProjectTemplates: SubProjectTemplate[];
}

interface InstantiateTemplateDialogProps {
  templateId: string | null;
  onClose: () => void;
  onCreated: () => void;
}

/** Variable names that contain these keywords get a date picker */
const DATE_KEYWORDS = ["date", "deadline", "due", "when"];

function isDateVariable(name: string): boolean {
  const lower = name.toLowerCase();
  return DATE_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Format a date input value (YYYY-MM-DD) into a human-readable string for variable interpolation */
function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InstantiateTemplateDialog({
  templateId,
  onClose,
  onCreated,
}: InstantiateTemplateDialogProps) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  // Raw date input values (YYYY-MM-DD) for date-type variables
  const [dateRawValues, setDateRawValues] = useState<Record<string, string>>(
    {}
  );
  const [areaId, setAreaId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`/api/project-templates/${templateId}`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch("/api/areas?active=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/goals").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
    ]).then(([tmpl, areasData, goalsData, teamsData]) => {
      setTemplate(tmpl);
      setAreas(areasData || []);
      setGoals(goalsData || []);
      setTeams(teamsData || []);
      setProjectTitle(tmpl?.title || "");
      // Pre-select team if template is team-scoped
      setTeamId(tmpl?.teamId || "");
      const vars: Record<string, string> = {};
      const dateRaw: Record<string, string> = {};
      for (const v of tmpl?.variables || []) {
        vars[v] = "";
        if (isDateVariable(v)) dateRaw[v] = "";
      }
      setVariables(vars);
      setDateRawValues(dateRaw);
      setAreaId("");
      setGoalId("");
      setLoading(false);
    });
  }, [templateId]);

  function resolve(text: string): string {
    let resolved = text;
    for (const [key, value] of Object.entries(variables)) {
      resolved = resolved.replaceAll(`{${key}}`, value || `{${key}}`);
    }
    return resolved;
  }

  function handleDateChange(varName: string, rawDate: string) {
    setDateRawValues((prev) => ({ ...prev, [varName]: rawDate }));
    // Store the formatted display string as the variable value for interpolation
    setVariables((prev) => ({
      ...prev,
      [varName]: rawDate ? formatDateForDisplay(rawDate) : "",
    }));
  }

  // Pick the first date variable value as the project target date
  function getTargetDate(): string | undefined {
    for (const v of template?.variables || []) {
      if (isDateVariable(v) && dateRawValues[v]) {
        return new Date(dateRawValues[v] + "T00:00:00Z").toISOString();
      }
    }
    return undefined;
  }

  async function handleCreate() {
    if (!template) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/project-templates/${template.id}/instantiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variables,
            projectTitle: projectTitle || undefined,
            targetDate: getTargetDate(),
            areaId: areaId || undefined,
            goalId: goalId || undefined,
            teamId: teamId || undefined,
          }),
        }
      );
      if (res.ok) {
        onCreated();
      }
    } catch {
      // silently fail
    }
    setCreating(false);
  }

  const allVariablesFilled =
    template?.variables.length === 0 ||
    template?.variables.every((v) => variables[v]?.trim());

  // Collect all tasks for preview (top-level + sub-project tasks)
  const allPreviewTasks: { title: string; sub?: string }[] = [];
  if (template) {
    for (const task of template.taskTemplates) {
      allPreviewTasks.push({ title: resolve(task.title) });
    }
    for (const sub of template.subProjectTemplates) {
      for (const task of sub.tasks) {
        allPreviewTasks.push({
          title: resolve(task.title),
          sub: resolve(sub.title),
        });
      }
    }
  }

  return (
    <Dialog
      open={!!templateId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? `Create from "${template.title}"` : "Loading..."}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : template ? (
          <div className="space-y-4">
            <div>
              <Label>Project Title</Label>
              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={template.title}
              />
            </div>

            {template.variables.length > 0 && (
              <div className="space-y-3">
                <Label className="text-muted-foreground">
                  Fill in template variables
                </Label>
                {template.variables.map((v) => (
                  <div key={v}>
                    <Label className="text-xs capitalize">
                      {v.replace(/_/g, " ")}
                    </Label>
                    {isDateVariable(v) ? (
                      <div>
                        <input
                          type="date"
                          value={dateRawValues[v] || ""}
                          onChange={(e) => handleDateChange(v, e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {dateRawValues[v] && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Will also set as project target date
                          </p>
                        )}
                      </div>
                    ) : (
                      <Input
                        value={variables[v] || ""}
                        onChange={(e) =>
                          setVariables((prev) => ({
                            ...prev,
                            [v]: e.target.value,
                          }))
                        }
                        placeholder={`Enter ${v.replace(/_/g, " ")}...`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Wedding template extras */}
            {template.sourceFile === "wedding-planning.yaml" && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-medium">This template will also set up:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                  <li>A wedding planning team with roles (Couple, Maid of Honor, Best Man, etc.)</li>
                  <li>Event RSVP with meal choice, dietary restrictions, and party size fields</li>
                  <li>RSVP auto-locks 4 weeks before the wedding date</li>
                  <li>Vendor Gratuity Guide wiki page</li>
                  <li>Discussion threads for venue, theme, music, seating, and budget</li>
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              {areas.length > 0 && (
                <div className="flex-1">
                  <Label className="text-xs">Area</Label>
                  <Select
                    value={areaId}
                    onValueChange={(v) => setAreaId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {goals.length > 0 && (
                <div className="flex-1">
                  <Label className="text-xs">Goal</Label>
                  <Select
                    value={goalId}
                    onValueChange={(v) => setGoalId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {goals.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {teams.length > 0 && (
                <div className="flex-1">
                  <Label className="text-xs">Team</Label>
                  <Select
                    value={teamId || "__none__"}
                    onValueChange={(v) => setTeamId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Task preview */}
            {allPreviewTasks.length > 0 && (
              <div>
                <Label className="text-muted-foreground text-xs">
                  Preview — {allPreviewTasks.length} task
                  {allPreviewTasks.length !== 1 ? "s" : ""} will be created
                </Label>
                <div className="mt-1 border rounded-md max-h-48 overflow-y-auto">
                  {template.subProjectTemplates.length > 0 &&
                    template.taskTemplates.length > 0 && (
                      <div className="px-3 py-1.5 border-b bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">
                          Top-level tasks
                        </span>
                      </div>
                    )}
                  {template.taskTemplates.map((task, i) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 px-3 py-1 text-xs border-b last:border-b-0"
                    >
                      <span className="text-muted-foreground w-4 text-right shrink-0">
                        {i + 1}.
                      </span>
                      <span>{resolve(task.title)}</span>
                    </div>
                  ))}
                  {template.subProjectTemplates.map((sub) => (
                    <div key={sub.id}>
                      <div className="px-3 py-1.5 border-b bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">
                          {resolve(sub.title)}
                        </span>
                      </div>
                      {sub.tasks.map((task, i) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 px-3 py-1 text-xs border-b last:border-b-0 pl-6"
                        >
                          <span className="text-muted-foreground w-4 text-right shrink-0">
                            {i + 1}.
                          </span>
                          <span>{resolve(task.title)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !allVariablesFilled}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
