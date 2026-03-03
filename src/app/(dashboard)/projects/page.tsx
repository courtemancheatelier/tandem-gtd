"use client";

import { Suspense, useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { HelpLink } from "@/components/shared/HelpLink";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban,
  Plus,
  Loader2,
  ArrowRight,
  Layers,
  ListChecks,
  CornerDownRight,
  Filter,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Sparkles,
  ArrowUpDown,
  CheckSquare,
  Trash2,
  Circle,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { useSelection } from "@/lib/hooks/use-selection";
import { ReviewBanner } from "@/components/review/ReviewBanner";
import { TeamIcon } from "@/components/teams/team-icons";
import { ProjectScaffoldPreview } from "@/components/projects/ProjectScaffoldPreview";
import { TemplateLibrary } from "@/components/projects/TemplateLibrary";
import { InstantiateTemplateDialog } from "@/components/projects/InstantiateTemplateDialog";
import type { ProjectScaffoldSuggestion } from "@/lib/ai/scaffold-types";
import { BottomFilterTray } from "@/components/layout/BottomFilterTray";

interface Project {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  outcome?: string | null;
  isSomedayMaybe: boolean;
  area?: { id: string; name: string } | null;
  team?: { id: string; name: string; icon?: string | null } | null;
  createdAt: string;
  taskCounts: { total: number; completed: number; active: number };
  parentProjectId?: string | null;
  parentProject?: { id: string; title: string } | null;
  rollupProgress?: number | null;
  childProjects?: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    rollupProgress?: number | null;
  }>;
}

interface TeamOption {
  id: string;
  name: string;
  icon?: string | null;
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ON_HOLD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COMPLETED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DROPPED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const typeIcons: Record<string, React.ReactNode> = {
  SEQUENTIAL: <ArrowRight className="h-3 w-3" />,
  PARALLEL: <Layers className="h-3 w-3" />,
  SINGLE_ACTIONS: <ListChecks className="h-3 w-3" />,
};

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const teamIdParam = searchParams.get("teamId");
  const areaParam = searchParams.get("area");
  const handledTeamId = useRef(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    type: "SEQUENTIAL" as string,
    outcome: "",
    teamId: "" as string,
    areaId: "" as string,
  });
  const [userTeams, setUserTeams] = useState<TeamOption[]>([]);
  const [userAreas, setUserAreas] = useState<{ id: string; name: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [areaFilter, setAreaFilter] = useState<string>(areaParam === "none" ? "NONE" : "ALL");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [scopeFilter, setScopeFilter] = useState<string>("ROOT");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [droppedCollapsed, setDroppedCollapsed] = useState(true);
  const [tasks, setTasks] = useState<Array<{ title: string }>>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [scaffoldSuggestion, setScaffoldSuggestion] = useState<ProjectScaffoldSuggestion | null>(null);
  const [scaffolding, setScaffolding] = useState(false);
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState<boolean | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchProjects();
  }, []);

  // Check if AI features are enabled for this user
  useEffect(() => {
    async function checkAiFeatures() {
      try {
        const res = await fetch("/api/settings/ai");
        if (!res.ok) {
          setAiFeaturesEnabled(false);
          return;
        }
        const data = await res.json();
        setAiFeaturesEnabled(
          data.aiEnabled &&
          data.inAppAiEnabled &&
          data.inAppAiFeaturesEnabled &&
          data.serverAiEnabled !== false &&
          data.serverInAppAiEnabled !== false
        );
      } catch {
        setAiFeaturesEnabled(false);
      }
    }
    checkAiFeatures();
  }, []);

  // Auto-open dialog with team pre-selected when teamId query param is present
  useEffect(() => {
    if (teamIdParam && !handledTeamId.current) {
      handledTeamId.current = true;
      setNewProject((prev) => ({ ...prev, teamId: teamIdParam }));
      setDialogOpen(true);
      fetchTeams();
      fetchAreas();
    }
  }, [teamIdParam]);

  async function fetchProjects() {
    const res = await fetch("/api/projects?someday=false");
    if (res.ok) {
      setProjects(await res.json());
    }
    setLoading(false);
  }

  async function fetchTeams() {
    const res = await fetch("/api/teams");
    if (res.ok) {
      setUserTeams(await res.json());
    }
  }

  async function fetchAreas() {
    const res = await fetch("/api/areas?active=true");
    if (res.ok) {
      setUserAreas(await res.json());
    }
  }

  async function createProject() {
    setCreating(true);

    // If tasks exist, use the create-with-tasks endpoint
    if (tasks.length > 0) {
      const payload = {
        projectTitle: newProject.title,
        projectDescription: newProject.description || undefined,
        type: scaffoldSuggestion ? scaffoldSuggestion.projectType : newProject.type,
        teamId: newProject.teamId || undefined,
        areaId: newProject.areaId || undefined,
        tasks,
        suggestion: scaffoldSuggestion || undefined,
      };
      const res = await fetch("/api/projects/create-with-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDialogOpen(false);
        resetDialog();
        fetchProjects();
      }
      setCreating(false);
      return;
    }

    // No tasks — use the standard endpoint
    const payload = {
      ...newProject,
      teamId: newProject.teamId || undefined,
      areaId: newProject.areaId || undefined,
    };
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setDialogOpen(false);
      resetDialog();
      fetchProjects();
    }
    setCreating(false);
  }

  function resetDialog() {
    setNewProject({ title: "", description: "", type: "SEQUENTIAL", outcome: "", teamId: "", areaId: "" });
    setTasks([]);
    setNewTaskTitle("");
    setScaffoldSuggestion(null);
  }

  function addTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    setTasks((prev) => [...prev, { title }]);
    setNewTaskTitle("");
    setScaffoldSuggestion(null);
  }

  function removeTask(index: number) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
    setScaffoldSuggestion(null);
  }

  async function requestScaffold() {
    if (tasks.length < 3 || !newProject.title) return;
    setScaffolding(true);
    try {
      const res = await fetch("/api/ai/scaffold-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTitle: newProject.title,
          projectDescription: newProject.description || undefined,
          tasks,
        }),
      });
      if (res.ok) {
        const suggestion: ProjectScaffoldSuggestion = await res.json();
        setScaffoldSuggestion(suggestion);
        setNewProject((prev) => ({ ...prev, type: suggestion.projectType }));
      }
    } catch {
      // Silently fail — user can still create without AI
    }
    setScaffolding(false);
  }

  const areas = useMemo(() => {
    const areaMap = new Map<string, string>();
    for (const p of projects) {
      if (p.area) areaMap.set(p.area.id, p.area.name);
    }
    return Array.from(areaMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [projects]);

  const teams = useMemo(() => {
    const teamMap = new Map<string, { id: string; name: string; icon?: string | null }>();
    for (const p of projects) {
      if (p.team) teamMap.set(p.team.id, p.team);
    }
    return Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (areaFilter === "NONE" && p.area) return false;
      if (areaFilter !== "ALL" && areaFilter !== "NONE" && p.area?.id !== areaFilter) return false;
      if (teamFilter === "PERSONAL" && p.team) return false;
      if (teamFilter !== "ALL" && teamFilter !== "PERSONAL" && p.team?.id !== teamFilter) return false;
      if (scopeFilter === "ROOT" && p.parentProjectId) return false;
      if (scopeFilter === "SUB" && !p.parentProjectId) return false;
      return true;
    });

    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "oldest") {
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === "name") {
      filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    return filtered;
  }, [projects, statusFilter, areaFilter, teamFilter, scopeFilter, sortBy]);

  const selection = useSelection({ items: filteredProjects });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeProjects = filteredProjects.filter((p) => p.status === "ACTIVE");
  const onHoldProjects = filteredProjects.filter((p) => p.status === "ON_HOLD");
  const completedProjects = filteredProjects.filter((p) => p.status === "COMPLETED");
  const droppedProjects = filteredProjects.filter((p) => p.status === "DROPPED");

  const hasActiveFilters = statusFilter !== "ALL" || areaFilter !== "ALL" || teamFilter !== "ALL" || scopeFilter !== "ROOT";

  async function handleBulkProjectDelete() {
    const ids = Array.from(selection.selectedIds);
    const res = await fetch("/api/projects/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: ids }),
    });
    if (res.ok) {
      const data = await res.json();
      toast({ title: "Projects deleted", description: `${data.deleted} project${data.deleted !== 1 ? "s" : ""} deleted` });
      selection.deselectAll();
      setSelectionMode(false);
      fetchProjects();
    } else {
      toast({ title: "Error", description: "Failed to delete projects", variant: "destructive" });
    }
  }

  async function handleBulkProjectUpdate(updates: Record<string, unknown>, label: string) {
    const ids = Array.from(selection.selectedIds);
    const res = await fetch("/api/projects/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: ids, updates }),
    });
    if (res.ok) {
      const data = await res.json();
      toast({
        title: `${label} updated`,
        description: `${data.updated} project${data.updated !== 1 ? "s" : ""} updated${data.skipped ? `, ${data.skipped} skipped` : ""}`,
      });
      selection.deselectAll();
      setSelectionMode(false);
      fetchProjects();
    } else {
      toast({ title: "Error", description: "Failed to update projects", variant: "destructive" });
    }
  }

  function renderProjectCard(project: Project, dimmed = false) {
    const isSelected = selection.isSelected(project.id);
    const cardContent = (
        <Card className={cn(
          dimmed
            ? "opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            : "hover:border-primary/50 transition-colors cursor-pointer",
          isSelected && "bg-primary/5 border-primary/30"
        )}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {selectionMode && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => selection.toggle(project.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                )}
                {typeIcons[project.type]}
                {project.title}
              </CardTitle>
              <div className="flex items-center gap-2">
                {!project.area && project.status === "ACTIVE" && (
                  <span
                    title="No area assigned"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      setAreaFilter("NONE");
                    }}
                  >
                    <Compass className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-muted-foreground" />
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {project.taskCounts.completed}/{project.taskCounts.total}
                </span>
                <Badge
                  variant="secondary"
                  className={statusColors[project.status]}
                >
                  {project.status.replace("_", " ")}
                </Badge>
              </div>
            </div>
            {project.parentProject && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CornerDownRight className="h-3 w-3" />
                <span
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/projects/${project.parentProject!.id}`;
                  }}
                >
                  {project.parentProject.title}
                </span>
              </p>
            )}
            {project.team && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <TeamIcon icon={project.team.icon} className="h-3 w-3" />
                {project.team.name}
              </p>
            )}
            {project.outcome && (
              <p className="text-xs text-muted-foreground mt-1">
                {project.outcome}
              </p>
            )}
            {project.taskCounts.total > 0 && (
              <div className="mt-2 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${(project.taskCounts.completed / project.taskCounts.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </CardHeader>
        </Card>
    );

    if (selectionMode) {
      return (
        <div key={project.id} onClick={() => selection.toggle(project.id)} className="cursor-pointer">
          {cardContent}
        </div>
      );
    }

    return (
      <Link key={project.id} href={`/projects/${project.id}`}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <ReviewBanner />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderKanban className="h-6 w-6" />
              Projects
              <HelpLink slug="projects-and-next-actions" />
            </h1>
            <Link
              href="/projects/outline"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Outline
            </Link>
          </div>
          <p className="text-muted-foreground mt-1">
            {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
            {hasActiveFilters && " (filtered)"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={selectionMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              if (selectionMode) {
                selection.deselectAll();
                setSelectionMode(false);
              } else {
                setSelectionMode(true);
              }
            }}
          >
            <CheckSquare className="h-4 w-4 mr-1" />
            {selectionMode ? "Cancel" : "Select"}
          </Button>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) { fetchTeams(); fetchAreas(); } }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {showTemplates ? (
                <>
                  <TemplateLibrary
                    onSelect={(template) => {
                      setShowTemplates(false);
                      setDialogOpen(false);
                      setSelectedTemplateId(template.id);
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowTemplates(false)}
                  >
                    Back to blank project
                  </Button>
                </>
              ) : (
              <>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowTemplates(true)}
              >
                Browse Templates
              </Button>
              <Separator />
              <div>
                <Label>Title</Label>
                <Input
                  value={newProject.title}
                  onChange={(e) =>
                    setNewProject({ ...newProject, title: e.target.value })
                  }
                  placeholder="Ship v2.0"
                />
              </div>
              <div>
                <Label>Desired Outcome</Label>
                <Input
                  value={newProject.outcome}
                  onChange={(e) =>
                    setNewProject({ ...newProject, outcome: e.target.value })
                  }
                  placeholder="What does 'done' look like?"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={newProject.type}
                  onValueChange={(v) =>
                    setNewProject({ ...newProject, type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEQUENTIAL">Sequential (tasks in order)</SelectItem>
                    <SelectItem value="PARALLEL">Parallel (all tasks available)</SelectItem>
                    <SelectItem value="SINGLE_ACTIONS">Single Actions (loose tasks)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {userAreas.length > 0 && (
                <div>
                  <Label>Area</Label>
                  <Select
                    value={newProject.areaId}
                    onValueChange={(v) =>
                      setNewProject({ ...newProject, areaId: v === "__none__" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {userAreas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({ ...newProject, description: e.target.value })
                  }
                  placeholder="Optional project notes..."
                  rows={3}
                />
              </div>

              {/* Tasks section */}
              <div>
                <Label>Tasks</Label>
                {scaffoldSuggestion ? (
                  <ProjectScaffoldPreview
                    suggestion={scaffoldSuggestion}
                    onUndo={() => setScaffoldSuggestion(null)}
                  />
                ) : (
                  <>
                    {tasks.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {tasks.map((task, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                          >
                            <span className="text-muted-foreground text-xs w-5">{i + 1}.</span>
                            <span className="flex-1">{task.title}</span>
                            <button
                              type="button"
                              onClick={() => removeTask(i)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Add a task..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTask();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTask}
                        disabled={!newTaskTitle.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
                {aiFeaturesEnabled && tasks.length >= 3 && !scaffoldSuggestion && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={requestScaffold}
                    disabled={scaffolding || !newProject.title}
                  >
                    {scaffolding ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                    )}
                    AI Suggest Order
                  </Button>
                )}
              </div>

              {userTeams.length > 0 && (
                <div>
                  <Label>Team</Label>
                  <Select
                    value={newProject.teamId}
                    onValueChange={(v) =>
                      setNewProject({ ...newProject, teamId: v === "personal" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Personal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      {userTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          <span className="inline-flex items-center gap-1.5"><TeamIcon icon={team.icon} className="h-3.5 w-3.5" />{team.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                onClick={createProject}
                disabled={!newProject.title || creating}
                className="w-full"
              >
                {creating ? "Creating..." : "Create Project"}
              </Button>
              </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <InstantiateTemplateDialog
          templateId={selectedTemplateId}
          onClose={() => setSelectedTemplateId(null)}
          onCreated={() => {
            setSelectedTemplateId(null);
            fetchProjects();
          }}
        />
        </div>
      </div>

      {/* Filters — desktop */}
      <div className="hidden md:flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="DROPPED">Dropped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className={cn("w-36 h-8 text-sm", areaFilter === "NONE" && "border-yellow-400 text-yellow-700 dark:border-yellow-500 dark:text-yellow-400")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Areas</SelectItem>
            <SelectItem value="NONE">No Area</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {teams.length > 0 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Teams</SelectItem>
              <SelectItem value="PERSONAL">Personal</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span className="inline-flex items-center gap-1.5"><TeamIcon icon={team.icon} className="h-3.5 w-3.5" />{team.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Projects</SelectItem>
            <SelectItem value="ROOT">Root Only</SelectItem>
            <SelectItem value="SUB">Sub-projects Only</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

        <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setStatusFilter("ALL");
              setAreaFilter("ALL");
              setTeamFilter("ALL");
              setScopeFilter("ROOT");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Filters — mobile bottom tray */}
      <BottomFilterTray
        activeFilterCount={
          (statusFilter !== "ALL" ? 1 : 0) +
          (areaFilter !== "ALL" ? 1 : 0) +
          (teamFilter !== "ALL" ? 1 : 0) +
          (scopeFilter !== "ROOT" ? 1 : 0)
        }
        actions={
          <Button
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => { setDialogOpen(true); fetchTeams(); fetchAreas(); }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        }
      >
        <div className="space-y-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="DROPPED">Dropped</SelectItem>
            </SelectContent>
          </Select>

          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className={cn("w-full h-8 text-sm", areaFilter === "NONE" && "border-yellow-400 text-yellow-700 dark:border-yellow-500 dark:text-yellow-400")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Areas</SelectItem>
              <SelectItem value="NONE">No Area</SelectItem>
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {teams.length > 0 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Teams</SelectItem>
                <SelectItem value="PERSONAL">Personal</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    <span className="inline-flex items-center gap-1.5"><TeamIcon icon={team.icon} className="h-3.5 w-3.5" />{team.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              <SelectItem value="ROOT">Root Only</SelectItem>
              <SelectItem value="SUB">Sub-projects Only</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs w-full"
              onClick={() => {
                setStatusFilter("ALL");
                setAreaFilter("ALL");
                setTeamFilter("ALL");
                setScopeFilter("ROOT");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </BottomFilterTray>

      <Separator />

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Active</h2>
          <div className="grid gap-3">
            {activeProjects.map((project) => renderProjectCard(project))}
          </div>
        </>
      )}

      {/* On Hold */}
      {onHoldProjects.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">On Hold</h2>
          <div className="grid gap-3">
            {onHoldProjects.map((project) => renderProjectCard(project, true))}
          </div>
        </>
      )}

      {/* Completed */}
      {completedProjects.length > 0 && (
        <>
          <button
            onClick={() => setCompletedCollapsed((v) => !v)}
            className="flex items-center gap-2 text-lg font-semibold hover:text-foreground/80 transition-colors"
          >
            {completedCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Completed
            <span className="text-sm font-normal text-muted-foreground">
              ({completedProjects.length})
            </span>
          </button>
          {!completedCollapsed && (
            <div className="grid gap-3">
              {completedProjects.map((project) => renderProjectCard(project, true))}
            </div>
          )}
        </>
      )}

      {/* Dropped */}
      {droppedProjects.length > 0 && (
        <>
          <button
            onClick={() => setDroppedCollapsed((v) => !v)}
            className="flex items-center gap-2 text-lg font-semibold hover:text-foreground/80 transition-colors"
          >
            {droppedCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Dropped
            <span className="text-sm font-normal text-muted-foreground">
              ({droppedProjects.length})
            </span>
          </button>
          {!droppedCollapsed && (
            <div className="grid gap-3">
              {droppedProjects.map((project) => renderProjectCard(project, true))}
            </div>
          )}
        </>
      )}

      {filteredProjects.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? "No projects match the current filters."
                : "No active projects. Create one to get started!"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {selection.isSelectionMode && (
        <ProjectBulkActionBar
          selectionCount={selection.selectionCount}
          areas={areas}
          onChangeStatus={(s) => handleBulkProjectUpdate({ status: s }, "Status")}
          onChangeArea={(id) => handleBulkProjectUpdate({ areaId: id }, "Area")}
          onDelete={handleBulkProjectDelete}
          onDeselectAll={() => { selection.deselectAll(); setSelectionMode(false); }}
        />
      )}
    </div>
  );
}

// --- Inline bulk action bar for projects ---

function ProjectBulkActionBar({
  selectionCount,
  areas,
  onChangeStatus,
  onChangeArea,
  onDelete,
  onDeselectAll,
}: {
  selectionCount: number;
  areas: { id: string; name: string }[];
  onChangeStatus: (status: string) => void;
  onChangeArea: (areaId: string | null) => void;
  onDelete: () => void;
  onDeselectAll: () => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusOptions = [
    { label: "Active", value: "ACTIVE" },
    { label: "On Hold", value: "ON_HOLD" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Dropped", value: "DROPPED" },
  ];

  return (
    <div
      className={cn(
        "fixed z-50",
        "bottom-[calc(1rem+56px+env(safe-area-inset-bottom))] md:bottom-4",
        "left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto",
        "flex flex-wrap md:flex-nowrap items-center justify-center md:justify-start gap-2 md:gap-3 rounded-lg border bg-background px-3 py-2 md:px-4 md:py-2.5 shadow-lg",
        "animate-in slide-in-from-bottom-4 fade-in duration-200"
      )}
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {selectionCount} selected
      </span>

      {/* Status */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Circle className="h-3.5 w-3.5" />
            Status
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="center" side="top">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusOpen(false); onChangeStatus(opt.value); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Area */}
      {areas.length > 0 && (
        <Popover open={areaOpen} onOpenChange={setAreaOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Compass className="h-3.5 w-3.5" />
              Area
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="center" side="top">
            <button
              onClick={() => { setAreaOpen(false); onChangeArea(null); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              No area
            </button>
            {areas.map((a) => (
              <button
                key={a.id}
                onClick={() => { setAreaOpen(false); onChangeArea(a.id); }}
                className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
              >
                {a.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Delete */}
      {!confirmDelete ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      ) : (
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5"
          onClick={() => { setConfirmDelete(false); onDelete(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Confirm delete {selectionCount}
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => { setConfirmDelete(false); onDeselectAll(); }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
