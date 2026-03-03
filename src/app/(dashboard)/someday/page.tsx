"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { Lightbulb, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { SomedayProjectCard } from "@/components/someday/SomedayProjectCard";
import { HelpLink } from "@/components/shared/HelpLink";

interface AreaInfo {
  id: string;
  name: string;
}

interface SomedayProject {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  createdAt: string;
  version: number;
  area?: { id: string; name: string } | null;
  taskCounts: { total: number; completed: number; active: number };
}

interface GroupedProjects {
  [areaName: string]: SomedayProject[];
}

export default function SomedayPage() {
  const [projects, setProjects] = useState<SomedayProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
  });
  const { toast } = useToast();

  const fetchProjects = useCallback(async () => {
    const [projRes, areaRes] = await Promise.all([
      fetch("/api/projects?someday=true"),
      fetch("/api/areas"),
    ]);
    if (projRes.ok) {
      setProjects(await projRes.json());
    }
    if (areaRes.ok) {
      const allAreas: AreaInfo[] = await areaRes.json();
      setAreas(allAreas);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function createProject() {
    if (!newProject.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProject.title.trim(),
          description: newProject.description.trim() || undefined,
          isSomedayMaybe: true,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewProject({ title: "", description: "" });
        toast({ title: "Added to Someday/Maybe" });
        fetchProjects();
      } else {
        toast({
          title: "Failed to create project",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Failed to create project",
        variant: "destructive",
      });
    }
    setCreating(false);
  }

  async function activateProject(id: string) {
    setActivatingId(id);
    const proj = projects.find((p) => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isSomedayMaybe: false,
          status: "ACTIVE",
          version: proj?.version,
        }),
      });
      if (res.status === 409) {
        toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
        fetchProjects();
      } else if (res.ok) {
        toast({ title: "Project activated" });
        fetchProjects();
      } else {
        toast({
          title: "Failed to activate project",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Failed to activate project",
        variant: "destructive",
      });
    }
    setActivatingId(null);
  }

  async function updateProject(id: string, data: { title?: string; description?: string; areaId?: string | null }) {
    const proj = projects.find((p) => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, version: proj?.version }),
      });
      if (res.status === 409) {
        toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
        fetchProjects();
      } else if (res.ok) {
        toast({ title: "Project updated" });
        fetchProjects();
      } else {
        toast({ title: "Failed to update project", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to update project", variant: "destructive" });
    }
  }

  async function dropProject(id: string) {
    setDroppingId(id);
    const proj = projects.find((p) => p.id === id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DROPPED",
          version: proj?.version,
        }),
      });
      if (res.status === 409) {
        toast({ title: "Conflict", description: "This project was modified by another user. Refreshing...", variant: "destructive" });
        fetchProjects();
      } else if (res.ok) {
        toast({ title: "Project dropped" });
        fetchProjects();
      } else {
        toast({
          title: "Failed to drop project",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Failed to drop project",
        variant: "destructive",
      });
    }
    setDroppingId(null);
  }

  // Group projects by area
  const grouped: GroupedProjects = {};
  for (const project of projects) {
    const areaName = project.area?.name ?? "No Area";
    if (!grouped[areaName]) {
      grouped[areaName] = [];
    }
    grouped[areaName].push(project);
  }

  // Sort area names: named areas first alphabetically, "No Area" last
  const sortedAreaNames = Object.keys(grouped).sort((a, b) => {
    if (a === "No Area") return 1;
    if (b === "No Area") return -1;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-6 w-6" />
            Someday/Maybe
            <HelpLink slug="organize" />
          </h1>
          <p className="text-muted-foreground mt-1">
            {projects.length} idea{projects.length !== 1 ? "s" : ""} parked for
            later
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Idea
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Someday/Maybe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={newProject.title}
                  onChange={(e) =>
                    setNewProject({ ...newProject, title: e.target.value })
                  }
                  placeholder="Learn woodworking, Start a podcast..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProject.title.trim()) {
                      createProject();
                    }
                  }}
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value,
                    })
                  }
                  placeholder="Any notes about this idea..."
                  rows={3}
                />
              </div>
              <Button
                onClick={createProject}
                disabled={!newProject.title.trim() || creating}
                className="w-full"
              >
                {creating ? "Adding..." : "Add to Someday/Maybe"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Nothing in Someday/Maybe. This is where ideas that aren&apos;t
              ready for action live.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add your first idea
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedAreaNames.map((areaName) => (
            <div key={areaName}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {areaName}
              </h2>
              <div className="grid gap-2">
                {grouped[areaName].map((project) => (
                  <SomedayProjectCard
                    key={project.id}
                    project={project}
                    areas={areas}
                    onActivate={activateProject}
                    onDrop={dropProject}
                    onUpdate={updateProject}
                    isActivating={activatingId === project.id}
                    isDropping={droppingId === project.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
