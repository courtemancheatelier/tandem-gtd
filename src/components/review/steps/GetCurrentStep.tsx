"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ListTodo,
  Calendar,
  Clock,
  FolderKanban,
  Target,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { TeamIcon } from "@/components/teams/team-icons";

interface GetCurrentStepProps {
  notes: string;
  onNotesChange: (notes: string) => void;
  onMarkComplete: () => void;
  onBack: () => void;
  saving: boolean;
}

interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  _count?: { tasks: number };
  tasks?: Array<{ status: string }>;
  team?: { id: string; name: string; icon?: string | null } | null;
}

interface WaitingForItem {
  id: string;
  description: string;
  person: string;
  isResolved: boolean;
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  isNextAction: boolean;
}

const reviewChecklist = [
  {
    id: "next_actions",
    label: "Review next actions list -- are they still relevant?",
    icon: ListTodo,
  },
  {
    id: "calendar_past",
    label: "Review past calendar -- anything to follow up on?",
    icon: Calendar,
  },
  {
    id: "calendar_upcoming",
    label: "Review upcoming calendar -- any prep needed?",
    icon: Calendar,
  },
  {
    id: "waiting_for",
    label: "Review waiting-for list -- any follow-ups needed?",
    icon: Clock,
  },
  {
    id: "projects",
    label: "Review project list -- any completed, stuck, or new?",
    icon: FolderKanban,
  },
  {
    id: "areas",
    label: "Review areas of focus -- anything being neglected?",
    icon: Target,
  },
];

export function GetCurrentStep({
  notes,
  onNotesChange,
  onMarkComplete,
  onBack,
  saving,
}: GetCurrentStepProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [waitingFor, setWaitingFor] = useState<WaitingForItem[]>([]);
  const [nextActions, setNextActions] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectsRes, waitingRes, tasksRes] = await Promise.all([
          fetch("/api/projects?status=ACTIVE"),
          fetch("/api/waiting-for"),
          fetch("/api/tasks?isNextAction=true"),
        ]);

        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects(Array.isArray(data) ? data : []);
        }
        if (waitingRes.ok) {
          const data = await waitingRes.json();
          const items = Array.isArray(data) ? data : [];
          setWaitingFor(items.filter((w: WaitingForItem) => !w.isResolved));
        }
        if (tasksRes.ok) {
          const data = await tasksRes.json();
          setNextActions(Array.isArray(data) ? data : []);
        }
      } catch {
        // Silently fail — not critical
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  function toggleItem(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const allChecked = reviewChecklist.every((item) => checkedItems[item.id]);
  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const openNextActions = nextActions.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
  );

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">
              {loading ? "..." : openNextActions.length}
            </p>
            <p className="text-xs text-muted-foreground">Next Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">
              {loading ? "..." : activeProjects.length}
            </p>
            <p className="text-xs text-muted-foreground">Active Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">
              {loading ? "..." : waitingFor.length}
            </p>
            <p className="text-xs text-muted-foreground">Waiting For</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick links to lists */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-3">Quick Links</h4>
          <div className="flex flex-wrap gap-2">
            <Link href="/do-now">
              <Button variant="outline" size="sm">
                <ListTodo className="h-3.5 w-3.5 mr-1.5" />
                Next Actions
                {!loading && openNextActions.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">
                    {openNextActions.length}
                  </Badge>
                )}
              </Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline" size="sm">
                <FolderKanban className="h-3.5 w-3.5 mr-1.5" />
                Projects
                {!loading && activeProjects.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">
                    {activeProjects.length}
                  </Badge>
                )}
              </Button>
            </Link>
            <Link href="/waiting-for">
              <Button variant="outline" size="sm">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Waiting For
                {!loading && waitingFor.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">
                    {waitingFor.length}
                  </Badge>
                )}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Active projects overview — grouped by personal / team */}
      {!loading && activeProjects.length > 0 && (() => {
        const personalProjects = activeProjects.filter((p) => !p.team);
        const teamMap = new Map<string, { name: string; icon?: string | null; projects: ProjectSummary[] }>();
        for (const p of activeProjects) {
          if (p.team) {
            const existing = teamMap.get(p.team.id);
            if (existing) {
              existing.projects.push(p);
            } else {
              teamMap.set(p.team.id, { name: p.team.name, icon: p.team.icon, projects: [p] });
            }
          }
        }
        const teamGroups = Array.from(teamMap.entries());
        const hasTeamProjects = teamGroups.length > 0;

        return (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Active Projects</h4>
                <Link href="/projects">
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    View All
                  </Button>
                </Link>
              </div>
              <div className="space-y-3">
                {/* Personal projects */}
                {personalProjects.length > 0 && (
                  <div>
                    {hasTeamProjects && (
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        Personal ({personalProjects.length})
                      </p>
                    )}
                    <div className="space-y-1">
                      {personalProjects.slice(0, 10).map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted transition-colors group"
                        >
                          <span className="text-sm group-hover:text-primary transition-colors">
                            {project.title}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {project.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      ))}
                      {personalProjects.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">
                          + {personalProjects.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Team project groups */}
                {teamGroups.map(([teamId, group]) => (
                  <div key={teamId}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      <TeamIcon icon={group.icon} className="h-3.5 w-3.5 inline mr-1" />{group.name} ({group.projects.length})
                    </p>
                    <div className="space-y-1">
                      {group.projects.slice(0, 10).map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted transition-colors group"
                        >
                          <span className="text-sm group-hover:text-primary transition-colors">
                            {project.title}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {project.status.replace("_", " ")}
                          </Badge>
                        </Link>
                      ))}
                      {group.projects.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">
                          + {group.projects.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Waiting for overview */}
      {!loading && waitingFor.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Open Waiting For Items
              </h4>
              <Link href="/waiting-for">
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  View All
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {waitingFor.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start gap-2 py-1">
                  <Clock className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <span>{item.description}</span>
                    <span className="text-muted-foreground"> -- {item.person}</span>
                  </div>
                </div>
              ))}
              {waitingFor.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {waitingFor.length - 5} more items
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review checklist */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-3">Review Checklist</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Work through each item. Open the relevant list, review it, then check it off.
          </p>
          <div className="space-y-3">
            {reviewChecklist.map((item) => {
              const Icon = item.icon;
              return (
                <label
                  key={item.id}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <Checkbox
                    checked={!!checkedItems[item.id]}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span
                    className={`text-sm ${
                      checkedItems[item.id]
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                </label>
              );
            })}
          </div>
          {allChecked && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              All items reviewed
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-2">Notes</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Capture any observations from reviewing your lists.
          </p>
          <Textarea
            placeholder="Stuck projects, overdue follow-ups, tasks to add..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={onMarkComplete} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Complete & Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
