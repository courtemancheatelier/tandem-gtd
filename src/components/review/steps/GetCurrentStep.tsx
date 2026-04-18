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
  MessageSquare,
  Vote,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { TeamIcon } from "@/components/teams/team-icons";
import { ReviewCalendarPanel } from "@/components/review/ReviewCalendarPanel";

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

interface ThreadSummary {
  id: string;
  title: string;
  purpose: string;
  isResolved: boolean;
  updatedAt: string;
  projectId?: string | null;
  taskId?: string | null;
  project?: { id: string; title: string } | null;
}

interface PendingDecision {
  id: string;
  question: string;
  status: string;
  deadline?: string | null;
  thread?: { projectId?: string | null } | null;
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
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [waitingFor, setWaitingFor] = useState<WaitingForItem[]>([]);
  const [nextActions, setNextActions] = useState<TaskSummary[]>([]);
  const [openThreads, setOpenThreads] = useState<ThreadSummary[]>([]);
  const [staleThreads, setStaleThreads] = useState<ThreadSummary[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState<PendingDecision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectsRes, waitingRes, tasksRes, threadsRes, decisionsRes] = await Promise.all([
          fetch("/api/projects?status=ACTIVE"),
          fetch("/api/waiting-for"),
          fetch("/api/tasks?isNextAction=true"),
          fetch("/api/threads?unresolved=true"),
          fetch("/api/decisions/pending"),
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
        if (threadsRes.ok) {
          const threads: ThreadSummary[] = await threadsRes.json();
          setOpenThreads(threads);
          // Stale = no activity in 7+ days
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          setStaleThreads(threads.filter((t) => new Date(t.updatedAt).getTime() < sevenDaysAgo));
        }
        if (decisionsRes.ok) {
          const data = await decisionsRes.json();
          setPendingDecisions(Array.isArray(data) ? data : []);
        }
      } catch {
        // Silently fail — not critical
      }
      setLoading(false);
    }
    fetchData();

    // Fire-and-forget: trigger read sync so calendar data is fresh
    fetch("/api/calendar/google/read-sync", { method: "POST" }).catch(() => {});
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

      {/* Open threads */}
      {!loading && openThreads.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Open Threads
                <Badge variant="secondary" className="text-xs">{openThreads.length}</Badge>
              </h4>
            </div>
            <div className="space-y-2">
              {openThreads.slice(0, 8).map((thread) => (
                <Link
                  key={thread.id}
                  href={thread.projectId ? `/projects/${thread.projectId}` : thread.project?.id ? `/projects/${thread.project.id}` : "#"}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge variant="outline" className="text-[10px] shrink-0">{thread.purpose}</Badge>
                    <span className="text-sm truncate group-hover:text-primary transition-colors">{thread.title}</span>
                  </div>
                  {thread.project && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] shrink-0 ml-2">
                      {thread.project.title}
                    </span>
                  )}
                </Link>
              ))}
              {openThreads.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {openThreads.length - 8} more threads
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stale threads warning */}
      {!loading && staleThreads.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="py-4">
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Stale Threads (7+ days inactive)
              <Badge variant="secondary" className="text-xs">{staleThreads.length}</Badge>
            </h4>
            <div className="space-y-2">
              {staleThreads.slice(0, 5).map((thread) => (
                <Link
                  key={thread.id}
                  href={thread.projectId ? `/projects/${thread.projectId}` : thread.project?.id ? `/projects/${thread.project.id}` : "#"}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted transition-colors group"
                >
                  <span className="text-sm truncate group-hover:text-primary transition-colors">{thread.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {Math.round((Date.now() - new Date(thread.updatedAt).getTime()) / (1000 * 60 * 60 * 24))}d ago
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending decisions */}
      {!loading && pendingDecisions.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium flex items-center gap-2">
                <Vote className="h-4 w-4 text-purple-500" />
                Pending Decisions
                <Badge variant="secondary" className="text-xs">{pendingDecisions.length}</Badge>
              </h4>
            </div>
            <div className="space-y-2">
              {pendingDecisions.slice(0, 5).map((decision) => (
                <Link
                  key={decision.id}
                  href={`/decisions/${decision.id}`}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted transition-colors group"
                >
                  <span className="text-sm truncate group-hover:text-primary transition-colors">{decision.question}</span>
                  {decision.deadline && (
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      Due {new Date(decision.deadline).toLocaleDateString()}
                    </span>
                  )}
                </Link>
              ))}
              {pendingDecisions.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {pendingDecisions.length - 5} more decisions
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
              const isCalendarItem = item.id === "calendar_past" || item.id === "calendar_upcoming";
              const isExpanded = expandedItem === item.id;

              return (
                <div key={item.id}>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <Checkbox
                      checked={!!checkedItems[item.id]}
                      onCheckedChange={() => toggleItem(item.id)}
                    />
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span
                      className={`text-sm flex-1 ${
                        checkedItems[item.id]
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                      onClick={(e) => {
                        if (isCalendarItem) {
                          e.preventDefault();
                          setExpandedItem(isExpanded ? null : item.id);
                        }
                      }}
                    >
                      {item.label}
                    </span>
                    {isCalendarItem && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline shrink-0"
                        onClick={(e) => {
                          e.preventDefault();
                          setExpandedItem(isExpanded ? null : item.id);
                        }}
                      >
                        {isExpanded ? "Hide" : "View"}
                      </button>
                    )}
                  </label>
                  {isCalendarItem && isExpanded && (
                    <div className="ml-7 mt-1 border-l-2 border-muted pl-3">
                      <ReviewCalendarPanel
                        direction={item.id === "calendar_past" ? "past" : "upcoming"}
                      />
                    </div>
                  )}
                </div>
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
