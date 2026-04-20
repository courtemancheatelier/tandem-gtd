"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamIcon } from "@/components/teams/team-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Settings, Plus, FolderPlus, X, ChevronDown, ChevronUp, MessageSquare, Vote, FileText, UsersRound, Info } from "lucide-react";
import { TeamMemberList, type TeamMemberData } from "@/components/teams/TeamMemberList";
import { AddMemberDialog } from "@/components/teams/AddMemberDialog";
import { useSession } from "next-auth/react";
import { TeamDecisionsTab } from "@/components/teams/TeamDecisionsTab";
import { TeamActivityTab } from "@/components/teams/TeamActivityTab";
import { DecisionHub } from "@/components/decisions/DecisionHub";
import { CreateTeamDialog } from "@/components/teams/CreateTeamDialog";

interface TeamProject {
  id: string;
  title: string;
  status: string;
  type: string;
  threadsEnabled: boolean;
  decisionsEnabled: boolean;
  completionNotesEnabled: boolean;
  _count: { tasks: number };
}

interface TeamEvent {
  id: string;
  eventType: string;
  createdAt: string;
  message?: string | null;
  actor?: { id: string; name: string } | null;
}

interface WikiArticleSummary {
  id: string;
  slug: string;
  title: string;
  updatedAt: string;
}

interface ChildTeamSummary {
  id: string;
  name: string;
  icon?: string | null;
  _count: { members: number; projects: number };
}

interface TeamDetail {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  parentTeam?: { id: string; name: string; icon?: string | null } | null;
  childTeams?: ChildTeamSummary[];
  members: TeamMemberData[];
  projects: TeamProject[];
  events: TeamEvent[];
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ON_HOLD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COMPLETED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DROPPED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export default function TeamDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const { data: session } = useSession();
  const currentUserId = session?.user?.id || "";

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [personalProjects, setPersonalProjects] = useState<{ id: string; title: string; status: string }[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const [wikiArticles, setWikiArticles] = useState<WikiArticleSummary[]>([]);
  const [addExistingWikiOpen, setAddExistingWikiOpen] = useState(false);
  const [personalWikiArticles, setPersonalWikiArticles] = useState<WikiArticleSummary[]>([]);
  const [loadingPersonalWiki, setLoadingPersonalWiki] = useState(false);
  const [movingWikiId, setMovingWikiId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    type: "SEQUENTIAL" as string,
    outcome: "",
  });
  const [expandedProjectSettings, setExpandedProjectSettings] = useState<string | null>(null);
  const [createChildOpen, setCreateChildOpen] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const { toast } = useToast();

  async function toggleProjectSetting(projectId: string, field: string, value: boolean) {
    const res = await fetch(`/api/projects/${projectId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setTeam((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId ? { ...p, [field]: value } : p
          ),
        };
      });
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to update setting", variant: "destructive" });
    }
  }

  const fetchTeam = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}`);
    if (res.ok) {
      setTeam(await res.json());
    } else {
      router.push("/teams");
    }
    setLoading(false);
  }, [teamId, router]);

  const fetchWikiArticles = useCallback(async () => {
    const res = await fetch(`/api/wiki?teamId=${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setWikiArticles(data.articles ?? []);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
    fetchWikiArticles();
  }, [fetchTeam, fetchWikiArticles]);

  const isAdmin = team?.members.some(
    (m) => m.user.id === currentUserId && m.role === "ADMIN"
  );

  async function addMember(data: { email: string; role: string; label?: string }) {
    setAddingMember(true);
    const res = await fetch(`/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setAddMemberOpen(false);
      toast({ title: "Member added", description: `${data.email} has been added to the team.` });
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to add member", variant: "destructive" });
    }
    setAddingMember(false);
  }

  async function handleRoleChange(userId: string, role: string) {
    const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to update role", variant: "destructive" });
    }
  }

  async function handleRemoveMember(userId: string) {
    const member = team?.members.find((m) => m.user.id === userId);
    const isSelf = userId === currentUserId;
    const msg = isSelf
      ? "Are you sure you want to leave this team?"
      : `Remove ${member?.user.name} from the team?`;
    if (!confirm(msg)) return;

    const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      if (isSelf) {
        router.push("/teams");
      } else {
        toast({ title: "Member removed" });
        fetchTeam();
      }
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to remove member", variant: "destructive" });
    }
  }

  async function createProject() {
    setCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newProject, teamId }),
    });
    if (res.ok) {
      setNewProjectOpen(false);
      setNewProject({ title: "", description: "", type: "SEQUENTIAL", outcome: "" });
      toast({ title: "Project created" });
      fetchTeam();
    } else {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    }
    setCreating(false);
  }

  async function fetchPersonalProjects() {
    setLoadingPersonal(true);
    const res = await fetch("/api/projects?someday=false");
    if (res.ok) {
      const all = await res.json();
      setPersonalProjects(
        all.filter((p: { teamId?: string | null; team?: unknown; status: string }) =>
          !p.teamId && !p.team && p.status === "ACTIVE"
        )
      );
    }
    setLoadingPersonal(false);
  }

  async function assignProjectToTeam(projectId: string) {
    setAssigningProjectId(projectId);

    // Check for broken wiki links before moving
    try {
      const checkRes = await fetch(`/api/projects/${projectId}/check-wiki-links?targetTeamId=${teamId}`);
      if (checkRes.ok) {
        const { brokenLinks } = await checkRes.json();
        if (brokenLinks.length > 0) {
          const titles = Array.from(new Set<string>(brokenLinks.map((l: { wikiTitle: string }) => l.wikiTitle)));
          const proceed = confirm(
            `Moving this project may break ${brokenLinks.length} wiki link(s) referencing articles not in this team:\n\n` +
            titles.map((t: string) => `  - ${t}`).join("\n") +
            "\n\nProceed anyway?"
          );
          if (!proceed) {
            setAssigningProjectId(null);
            return;
          }
        }
      }
    } catch {
      // If check fails, proceed without warning
    }

    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This project was modified by someone else. Please try again.", variant: "destructive" });
      setAddExistingOpen(false);
      fetchTeam();
    } else if (res.ok) {
      toast({ title: "Project added to team" });
      setAddExistingOpen(false);
      fetchTeam();
    } else {
      toast({ title: "Error", description: "Failed to assign project", variant: "destructive" });
    }
    setAssigningProjectId(null);
  }

  async function fetchPersonalWikiArticles() {
    setLoadingPersonalWiki(true);
    const res = await fetch("/api/wiki");
    if (res.ok) {
      setPersonalWikiArticles(await res.json());
    }
    setLoadingPersonalWiki(false);
  }

  async function moveWikiToTeam(articleId: string) {
    setMovingWikiId(articleId);
    const res = await fetch("/api/wiki/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, targetTeamId: teamId }),
    });
    if (res.ok) {
      toast({ title: "Article added to team" });
      setAddExistingWikiOpen(false);
      fetchWikiArticles();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to move article", variant: "destructive" });
    }
    setMovingWikiId(null);
  }

  async function removeWikiFromTeam(articleId: string, articleTitle: string) {
    if (!confirm(`Remove "${articleTitle}" from this team? It will become a personal article.`)) return;
    const res = await fetch("/api/wiki/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, targetTeamId: null }),
    });
    if (res.ok) {
      toast({ title: "Article removed from team" });
      fetchWikiArticles();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to remove article", variant: "destructive" });
    }
  }

  async function createChildTeam(data: { name: string; description?: string; icon?: string }) {
    setCreatingChild(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, parentTeamId: teamId }),
    });
    if (res.ok) {
      setCreateChildOpen(false);
      toast({ title: "Group created", description: `"${data.name}" has been created.` });
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to create group", variant: "destructive" });
    }
    setCreatingChild(false);
  }

  async function removeProjectFromTeam(projectId: string, projectTitle: string) {
    if (!confirm(`Remove "${projectTitle}" from this team? It will become a personal project.`)) return;

    // Check for broken wiki links when removing from team
    try {
      const checkRes = await fetch(`/api/projects/${projectId}/check-wiki-links`);
      if (checkRes.ok) {
        const { brokenLinks } = await checkRes.json();
        if (brokenLinks.length > 0) {
          const titles = Array.from(new Set<string>(brokenLinks.map((l: { wikiTitle: string }) => l.wikiTitle)));
          const proceed = confirm(
            `This project has ${brokenLinks.length} wiki link(s) referencing team articles that won't be accessible as personal:\n\n` +
            titles.map((t: string) => `  - ${t}`).join("\n") +
            "\n\nProceed anyway?"
          );
          if (!proceed) return;
        }
      }
    } catch {
      // If check fails, proceed without warning
    }

    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: null }),
    });
    if (res.status === 409) {
      toast({ title: "Conflict", description: "This project was modified by someone else. Please try again.", variant: "destructive" });
      fetchTeam();
    } else if (res.ok) {
      toast({ title: "Project removed from team" });
      fetchTeam();
    } else {
      toast({ title: "Error", description: "Failed to remove project", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="space-y-4">
      {/* Breadcrumb for child teams */}
      {team.parentTeam && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link
            href={`/teams/${team.parentTeam.id}`}
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <TeamIcon icon={team.parentTeam.icon} className="h-3.5 w-3.5" />
            {team.parentTeam.name}
          </Link>
          <span>&gt;</span>
          <span className="text-foreground">{team.name}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TeamIcon icon={team.icon} className="h-6 w-6" />
            {team.name}
          </h1>
          {team.description && (
            <p className="text-muted-foreground mt-1">{team.description}</p>
          )}
        </div>
        {isAdmin && (
          <Link href={`/teams/${teamId}/settings`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </Link>
        )}
      </div>

      {/* Permission callout for child teams */}
      {team.parentTeam && (() => {
        const parentTeamWithCount = team.parentTeam as { id: string; name: string; icon?: string | null; _count?: { members: number } };
        const parentMemberCount = parentTeamWithCount._count?.members ?? 0;
        if (parentMemberCount > team.members.length) {
          return (
            <div className="flex items-start gap-2 rounded-md border border-muted bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Members of a parent group don&apos;t automatically see this group&apos;s projects. Add them directly to grant access.
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* Tabs */}
      <Tabs defaultValue="members">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="members">Members ({team.members.length})</TabsTrigger>
          {((team.childTeams?.length ?? 0) > 0 || (isAdmin && !team.parentTeam)) && (
            <TabsTrigger value="groups">Groups ({team.childTeams?.length ?? 0})</TabsTrigger>
          )}
          <TabsTrigger value="projects">Projects ({team.projects.length})</TabsTrigger>
          <TabsTrigger value="wiki">Wiki ({wikiArticles.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          <div className="space-y-3">
            {isAdmin && (
              <div className="flex justify-end">
                <AddMemberDialog
                  open={addMemberOpen}
                  onOpenChange={setAddMemberOpen}
                  onSubmit={addMember}
                  loading={addingMember}
                />
              </div>
            )}
            <TeamMemberList
              members={team.members}
              isAdmin={!!isAdmin}
              currentUserId={currentUserId}
              onRoleChange={isAdmin ? handleRoleChange : undefined}
              onRemove={handleRemoveMember}
            />
          </div>
        </TabsContent>

        {/* Groups Tab (child teams) */}
        {((team.childTeams?.length ?? 0) > 0 || (isAdmin && !team.parentTeam)) && (
          <TabsContent value="groups">
            <div className="space-y-3">
              {isAdmin && (
                <div className="flex justify-end">
                  <CreateTeamDialog
                    open={createChildOpen}
                    onOpenChange={setCreateChildOpen}
                    onSubmit={createChildTeam}
                    loading={creatingChild}
                    triggerLabel="+ Add Group"
                    lockedParentTeamId={teamId}
                    parentTeamOptions={[{ id: teamId, name: team.name, icon: team.icon }]}
                  />
                </div>
              )}
              {(team.childTeams?.length ?? 0) > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {team.childTeams?.map((child) => (
                    <Link key={child.id} href={`/teams/${child.id}`}>
                      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TeamIcon icon={child.icon} className="h-4 w-4" />
                            {child.name}
                          </CardTitle>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <UsersRound className="h-3 w-3" />
                              {child._count.members} member{child._count.members !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                              <FolderPlus className="h-3 w-3" />
                              {child._count.projects} project{child._count.projects !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-muted-foreground text-sm">
                      No child groups yet. Create one to organize sub-teams.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}

        {/* Projects Tab */}
        <TabsContent value="projects">
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAddExistingOpen(true); fetchPersonalProjects(); }}
              >
                <FolderPlus className="h-4 w-4 mr-1" />
                Add Existing
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNewProjectOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Project
              </Button>
            </div>

            {/* New Project Dialog */}
            <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Project for {team.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={newProject.title}
                      onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                      placeholder="Ship v2.0"
                    />
                  </div>
                  <div>
                    <Label>Desired Outcome</Label>
                    <Input
                      value={newProject.outcome}
                      onChange={(e) => setNewProject({ ...newProject, outcome: e.target.value })}
                      placeholder="What does 'done' look like?"
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={newProject.type}
                      onValueChange={(v) => setNewProject({ ...newProject, type: v })}
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
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={newProject.description}
                      onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                      placeholder="Optional project notes..."
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={createProject}
                    disabled={!newProject.title || creating}
                    className="w-full"
                  >
                    {creating ? "Creating..." : "Create Project"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Add Existing Project Dialog */}
            <Dialog open={addExistingOpen} onOpenChange={setAddExistingOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Existing Project</DialogTitle>
                </DialogHeader>
                {loadingPersonal ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : personalProjects.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {personalProjects.map((project) => (
                      <Card key={project.id} className="hover:border-primary/50 transition-colors">
                        <CardHeader className="py-2 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">{project.title}</CardTitle>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={assigningProjectId === project.id}
                              onClick={() => assignProjectToTeam(project.id)}
                            >
                              {assigningProjectId === project.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Add"
                              )}
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No personal projects available to add.
                  </p>
                )}
              </DialogContent>
            </Dialog>

            {team.projects.length > 0 ? (
              <div className="grid gap-3">
                {team.projects.map((project) => (
                  <Card key={project.id} className="hover:border-primary/50 transition-colors">
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <Link href={`/projects/${project.id}`} className="flex-1 min-w-0 cursor-pointer">
                          <CardTitle className="text-sm font-medium">
                            {project.title}
                          </CardTitle>
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {project._count.tasks} task{project._count.tasks !== 1 ? "s" : ""}
                          </span>
                          <TooltipProvider delayDuration={200}>
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <MessageSquare className={`h-3 w-3 ${project.threadsEnabled ? "text-blue-500" : "text-muted-foreground/30"}`} />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                  Threads {project.threadsEnabled ? "on" : "off"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Vote className={`h-3 w-3 ${project.decisionsEnabled ? "text-purple-500" : "text-muted-foreground/30"}`} />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                  Decisions {project.decisionsEnabled ? "on" : "off"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <FileText className={`h-3 w-3 ${project.completionNotesEnabled ? "text-green-500" : "text-muted-foreground/30"}`} />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                  Completion notes {project.completionNotesEnabled ? "on" : "off"}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                          <Badge variant="secondary" className={statusColors[project.status] || ""}>
                            {project.status.replace("_", " ")}
                          </Badge>
                          {isAdmin && (
                            <button
                              title="Project settings"
                              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                              onClick={() => setExpandedProjectSettings(
                                expandedProjectSettings === project.id ? null : project.id
                              )}
                            >
                              {expandedProjectSettings === project.id ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            title="Remove from team"
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                            onClick={() => removeProjectFromTeam(project.id, project.title)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    {isAdmin && expandedProjectSettings === project.id && (
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="border-t pt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Team Features</p>
                          <div className="flex items-center justify-between">
                            <label className="text-sm">Threads</label>
                            <Switch
                              checked={project.threadsEnabled}
                              onCheckedChange={(v) => toggleProjectSetting(project.id, "threadsEnabled", v)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="text-sm">Decisions</label>
                            <Switch
                              checked={project.decisionsEnabled}
                              onCheckedChange={(v) => toggleProjectSetting(project.id, "decisionsEnabled", v)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="text-sm">Completion Notes</label>
                            <Switch
                              checked={project.completionNotesEnabled}
                              onCheckedChange={(v) => toggleProjectSetting(project.id, "completionNotesEnabled", v)}
                            />
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No team projects yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Wiki Tab */}
        <TabsContent value="wiki">
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAddExistingWikiOpen(true); fetchPersonalWikiArticles(); }}
              >
                <FolderPlus className="h-4 w-4 mr-1" />
                Add Existing
              </Button>
              <Link href={`/wiki?teamId=${teamId}`}>
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>

            {/* Add Existing Wiki Article Dialog */}
            <Dialog open={addExistingWikiOpen} onOpenChange={setAddExistingWikiOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Personal Wiki Article</DialogTitle>
                </DialogHeader>
                {loadingPersonalWiki ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : personalWikiArticles.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {personalWikiArticles.map((article) => (
                      <Card key={article.id} className="hover:border-primary/50 transition-colors">
                        <CardHeader className="py-2 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">{article.title}</CardTitle>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={movingWikiId === article.id}
                              onClick={() => moveWikiToTeam(article.id)}
                            >
                              {movingWikiId === article.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Add"
                              )}
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No personal wiki articles available to add.
                  </p>
                )}
              </DialogContent>
            </Dialog>

            {wikiArticles.length > 0 ? (
              <div className="grid gap-2">
                {wikiArticles.map((article) => (
                  <Card key={article.id} className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="py-2 px-4">
                      <div className="flex items-center justify-between">
                        <Link href={`/wiki/${article.slug}?teamId=${teamId}`} className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate">{article.title}</span>
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(article.updatedAt).toLocaleDateString()}
                          </span>
                          <button
                            title="Remove from team"
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                            onClick={() => removeWikiFromTeam(article.id, article.title)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No wiki articles yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <TeamActivityTab teamId={teamId} />
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions">
          <TeamDecisionsTab teamId={teamId} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="proposals">
          <DecisionHub teamId={teamId} currentUserId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
