"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Settings, FolderKanban, Plus, UsersRound, FolderPlus, X, BookOpen, ArrowRight } from "lucide-react";
import { TeamMemberList, type TeamMemberData } from "@/components/teams/TeamMemberList";
import { AddMemberDialog } from "@/components/teams/AddMemberDialog";
import { useSession } from "next-auth/react";

interface TeamProject {
  id: string;
  title: string;
  status: string;
  type: string;
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

interface TeamDetail {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
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
  const { toast } = useToast();

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
      setWikiArticles(await res.json());
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

  const eventLabels: Record<string, string> = {
    CREATED: "created the team",
    UPDATED: "updated team settings",
    MEMBER_ADDED: "added a member",
    MEMBER_REMOVED: "removed a member",
    MEMBER_ROLE_CHANGED: "changed a member's role",
  };

  return (
    <div className="space-y-6">
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

      <Separator />

      {/* Members Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            Members ({team.members.length})
          </h2>
          {isAdmin && (
            <AddMemberDialog
              open={addMemberOpen}
              onOpenChange={setAddMemberOpen}
              onSubmit={addMember}
              loading={addingMember}
            />
          )}
        </div>
        <TeamMemberList
          members={team.members}
          isAdmin={!!isAdmin}
          currentUserId={currentUserId}
          onRoleChange={isAdmin ? handleRoleChange : undefined}
          onRemove={handleRemoveMember}
        />
      </div>

      <Separator />

      {/* Projects Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects ({team.projects.length})
          </h2>
          <div className="flex items-center gap-2">
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
              <Card key={project.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">
                        {project.title}
                      </CardTitle>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {project._count.tasks} task{project._count.tasks !== 1 ? "s" : ""}
                      </span>
                      <Badge variant="secondary" className={statusColors[project.status] || ""}>
                        {project.status.replace("_", " ")}
                      </Badge>
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

      {/* Wiki Section */}
      <Separator />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Wiki ({wikiArticles.length})
          </h2>
          <div className="flex items-center gap-2">
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
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
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
            {wikiArticles.slice(0, 5).map((article) => (
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

      {/* Recent Activity */}
      {team.events.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
            <div className="space-y-2">
              {team.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground py-1"
                >
                  <span className="font-medium text-foreground">
                    {event.actor?.name || "System"}
                  </span>
                  <span>{eventLabels[event.eventType] || event.eventType.toLowerCase()}</span>
                  <span className="ml-auto text-xs">
                    {new Date(event.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
