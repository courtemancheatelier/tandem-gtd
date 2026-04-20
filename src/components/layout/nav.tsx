"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Zap,
  Inbox,
  FolderKanban,
  FileText,
  History,
  BarChart3,
  CalendarDays,
  Clock,
  Lightbulb,
  Layers,
  Mountain,
  BookOpen,
  HelpCircle,
  RotateCcw,
  Settings,
  Shield,
  LogOut,
  UsersRound,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Coffee,
  Timer,
  TrendingDown,
} from "lucide-react";
import { Suspense } from "react";
import { QuickViewNav } from "./QuickViewNav";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { TeamIcon } from "@/components/teams/team-icons";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, featureKey: "dashboard" },
      { href: "/insights", label: "Insights", icon: BarChart3, featureKey: "insights" },
      { href: "/activity", label: "Activity", icon: History },
    ],
  },
  {
    label: "GTD",
    items: [
      { href: "/do-now", label: "Do Now", icon: Zap },
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/projects/outline", label: "Outline", icon: FileText },
      { href: "/waiting-for", label: "Waiting For", icon: Clock },
      { href: "/someday", label: "Someday/Maybe", icon: Lightbulb },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, featureKey: "calendar" },
    ],
  },
  {
    label: "Patterns",
    items: [
      { href: "/do-now/card-file", label: "Card File", icon: RotateCcw, featureKey: "cardFile" },
      { href: "/drift", label: "Drift", icon: TrendingDown, featureKey: "drift" },
    ],
  },
  {
    label: "Reflect",
    items: [
      { href: "/areas", label: "Areas", icon: Layers },
      { href: "/horizons", label: "Horizons", icon: Mountain },
      { href: "/review", label: "Weekly Review", icon: RotateCcw },
      { href: "/time-audit", label: "Time Audit", icon: Timer, featureKey: "timeAudit" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/wiki", label: "Wiki", icon: BookOpen, featureKey: "wiki" },
      { href: "/help", label: "Help", icon: HelpCircle },
    ],
  },
];

interface TeamNavItem {
  id: string;
  name: string;
  icon?: string | null;
  parentTeamId?: string | null;
  childTeams?: { id: string; name: string; icon?: string | null }[];
}

interface NavProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavItemClick?: () => void;
}

function NavTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Nav({ collapsed = false, onToggleCollapse, onNavItemClick }: NavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin;
  const [mounted, setMounted] = useState(false);
  const [teams, setTeams] = useState<TeamNavItem[]>([]);
  const [teamsEnabled, setTeamsEnabled] = useState(false);

  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [horizonNudge, setHorizonNudge] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [hiddenFeatures, setHiddenFeatures] = useState<Set<string>>(new Set());

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem("nav-collapsed-sections", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("nav-collapsed-sections");
      if (saved) {
        setCollapsedSections(JSON.parse(saved));
      } else {
        // Default: Overview collapsed on first visit
        setCollapsedSections({ Overview: true });
      }
    } catch {}
    fetch("/api/teams")
      .then((r) => (r.ok ? r.json() : { teams: [], teamsEnabled: false }))
      .then((data) => {
        setTeamsEnabled(data.teamsEnabled ?? true);
        setTeams((data.teams ?? []).slice(0, 5));
      })
      .catch(() => {});

    fetch("/api/settings/features")
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then((data) => {
        const hidden = new Set<string>(
          (data.features ?? [])
            .filter((f: { visible: boolean }) => !f.visible)
            .map((f: { key: string }) => f.key)
        );
        setHiddenFeatures(hidden);
      })
      .catch(() => {});

    fetch("/api/public/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.supportUrl) setSupportUrl(data.supportUrl);
      })
      .catch(() => {});

    // Check if a horizon review is due (no notes = setup needed, or >90 days since last review)
    Promise.all([
      fetch("/api/horizon-notes").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/horizon-reviews/latest").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([notes, latest]) => {
        const hasNotes = Array.isArray(notes) && notes.length > 0;
        if (!hasNotes) {
          setHorizonNudge(true);
          return;
        }
        if (!latest || !latest.completedAt) {
          setHorizonNudge(true);
          return;
        }
        const daysSince = Math.floor(
          (Date.now() - new Date(latest.completedAt).getTime()) / 86400000
        );
        setHorizonNudge(daysSince > 90);
      })
      .catch(() => {});
  }, []);

  // Filter nav sections based on hidden features
  const filteredNavSections = useMemo(() => {
    if (hiddenFeatures.size === 0) return navSections;
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.featureKey || !hiddenFeatures.has(item.featureKey)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [hiddenFeatures]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col">
        <div className={cn("flex items-start py-4", collapsed ? "justify-center px-1" : "justify-between px-4")}>
          {!collapsed && (
            <div className="group">
              <a href="https://www.courtemancheatelier.studio/tandem-gtd/" target="_blank" rel="noopener noreferrer" className="flex items-center hover:text-primary transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/tandem-logo.svg" alt="T" className="h-6 w-6 -mr-0.5" />
                <h1 className="text-base font-bold leading-7">andem GTD™</h1>
              </a>
              <div className="overflow-hidden max-h-0 group-hover:max-h-5 transition-all duration-200 ease-out">
                <p className="text-[11px] text-muted-foreground text-center">
                  v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.9"}
                  {process.env.NEXT_PUBLIC_VERSION_SUFFIX ? ` ${process.env.NEXT_PUBLIC_VERSION_SUFFIX}` : ""}
                </p>
              </div>
            </div>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={onToggleCollapse}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className={cn("flex-1 py-2", collapsed ? "px-1" : "px-2")}>
          <nav className="space-y-2">
            <div className="space-y-0.5">
              <NavTooltip label="Notifications" collapsed={collapsed}>
                <NotificationBell collapsed={collapsed} />
              </NavTooltip>
            </div>
            {filteredNavSections.slice(0, 1).map((section) => {
              const isSectionCollapsed = !collapsed && collapsedSections[section.label];
              return (
              <div key={section.label}>
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.label)}
                    className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    {section.label}
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isSectionCollapsed && "-rotate-90"
                      )}
                    />
                  </button>
                )}
                {!isSectionCollapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const hasMoreSpecificSibling = section.items.some(
                      (other) =>
                        other.href !== item.href &&
                        other.href.startsWith(item.href) &&
                        pathname.startsWith(other.href)
                    );
                    const isActive =
                      !hasMoreSpecificSibling &&
                      (pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(item.href)));
                    return (
                      <NavTooltip key={item.href} label={item.label} collapsed={collapsed}>
                        <Link
                          href={item.href}
                          onClick={onNavItemClick}
                          className={cn(
                            "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && item.label}
                        </Link>
                      </NavTooltip>
                    );
                  })}
                </div>
                )}
              </div>
              );
            })}
            <Suspense fallback={null}>
              <QuickViewNav
                collapsed={collapsed}
                onNavItemClick={onNavItemClick}
                sectionCollapsed={!collapsed && !!collapsedSections["Quick Views"]}
                onToggleSection={() => toggleSection("Quick Views")}
              />
            </Suspense>
            {filteredNavSections.slice(1).map((section) => {
              const isSectionCollapsed = !collapsed && collapsedSections[section.label];
              return (
              <div key={section.label}>
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.label)}
                    className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    {section.label}
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isSectionCollapsed && "-rotate-90"
                      )}
                    />
                  </button>
                )}
                {!isSectionCollapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    // Check if a sibling nav item is a more specific match
                    const hasMoreSpecificSibling = section.items.some(
                      (other) =>
                        other.href !== item.href &&
                        other.href.startsWith(item.href) &&
                        pathname.startsWith(other.href)
                    );
                    const isActive =
                      !hasMoreSpecificSibling &&
                      (pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(item.href)));
                    return (
                      <NavTooltip key={item.href} label={item.label} collapsed={collapsed}>
                        <Link
                          href={item.href}
                          onClick={onNavItemClick}
                          className={cn(
                            "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              item.href === "/horizons" && horizonNudge && !isActive && "text-blue-500"
                            )}
                          />
                          {!collapsed && item.label}
                        </Link>
                      </NavTooltip>
                    );
                  })}
                </div>
                )}
              </div>
              );
            })}
            {/* Teams — gated on mounted to avoid hydration mismatch (data is client-fetched) */}
            {mounted && teamsEnabled && (() => {
              const isTeamsCollapsed = !collapsed && collapsedSections["Teams"];
              return (
              <div>
                {!collapsed && (
                  <button
                    onClick={() => toggleSection("Teams")}
                    className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    Teams
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isTeamsCollapsed && "-rotate-90"
                      )}
                    />
                  </button>
                )}
                {!isTeamsCollapsed && (() => {
                  // Separate top-level teams (no parent) from child teams
                  const topLevelTeams = teams.filter((t) => !t.parentTeamId);
                  const childTeamIds = new Set(teams.filter((t) => t.parentTeamId).map((t) => t.id));

                  return (
                <div className="space-y-0.5">
                  <NavTooltip label="Teams" collapsed={collapsed}>
                    <Link
                      href="/teams"
                      onClick={onNavItemClick}
                      className={cn(
                        "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5",
                        pathname === "/teams"
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      <UsersRound className="h-4 w-4 shrink-0" />
                      {!collapsed && "Teams"}
                    </Link>
                  </NavTooltip>
                  {topLevelTeams.map((team) => {
                    const href = `/teams/${team.id}`;
                    const active = pathname.startsWith(href) && !team.childTeams?.some((c) => pathname.startsWith(`/teams/${c.id}`));
                    const hasChildren = (team.childTeams?.length ?? 0) > 0;
                    const isParentExpanded = !collapsedSections[`team-${team.id}`];
                    // Show children that the user is a member of (present in teams list) or from childTeams
                    const visibleChildren = team.childTeams?.filter((c) => childTeamIds.has(c.id) || teams.some((t) => t.id === c.id)) ?? [];
                    return (
                      <div key={team.id}>
                        <div className="flex items-center">
                          <NavTooltip label={team.name} collapsed={collapsed}>
                            <Link
                              href={href}
                              onClick={onNavItemClick}
                              className={cn(
                                "flex-1 flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                                collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5 pl-4",
                                active
                                  ? "bg-accent text-accent-foreground"
                                  : "text-muted-foreground"
                              )}
                            >
                              <TeamIcon icon={team.icon} className="h-4 w-4 shrink-0" />
                              {!collapsed && <span className="truncate">{team.name}</span>}
                            </Link>
                          </NavTooltip>
                          {!collapsed && hasChildren && visibleChildren.length > 0 && (
                            <button
                              onClick={() => toggleSection(`team-${team.id}`)}
                              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ChevronDown
                                className={cn(
                                  "h-3 w-3 transition-transform",
                                  !isParentExpanded && "-rotate-90"
                                )}
                              />
                            </button>
                          )}
                        </div>
                        {!collapsed && isParentExpanded && visibleChildren.map((child) => {
                          const childHref = `/teams/${child.id}`;
                          const childActive = pathname.startsWith(childHref);
                          return (
                            <NavTooltip key={child.id} label={child.name} collapsed={collapsed}>
                              <Link
                                href={childHref}
                                onClick={onNavItemClick}
                                className={cn(
                                  "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                                  "gap-3 px-2 py-1.5 pl-8",
                                  childActive
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground"
                                )}
                              >
                                <TeamIcon icon={child.icon} className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{child.name}</span>
                              </Link>
                            </NavTooltip>
                          );
                        })}
                      </div>
                    );
                  })}
                  {/* Show child teams the user is a member of but whose parent they're NOT a member of */}
                  {teams.filter((t) => t.parentTeamId && !topLevelTeams.some((p) => p.id === t.parentTeamId)).map((team) => {
                    const href = `/teams/${team.id}`;
                    const active = pathname.startsWith(href);
                    return (
                      <NavTooltip key={team.id} label={team.name} collapsed={collapsed}>
                        <Link
                          href={href}
                          onClick={onNavItemClick}
                          className={cn(
                            "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5 pl-4",
                            active
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          <TeamIcon icon={team.icon} className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="truncate">{team.name}</span>}
                        </Link>
                      </NavTooltip>
                    );
                  })}
                </div>
                  );
                })()}
              </div>
              );
            })()}
          </nav>
        </ScrollArea>
        <Separator />
        <div className={cn("py-2 space-y-0.5", collapsed ? "px-1" : "px-2")}>
          <NavTooltip label="Settings" collapsed={collapsed}>
            <Link
              href="/settings"
              onClick={onNavItemClick}
              className={cn(
                "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5",
                pathname === "/settings"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!collapsed && "Settings"}
            </Link>
          </NavTooltip>
          {mounted && isAdmin && (
            <NavTooltip label="Admin" collapsed={collapsed}>
              <Link
                href="/settings/admin"
                onClick={onNavItemClick}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5",
                  pathname === "/settings/admin"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Shield className="h-4 w-4 shrink-0" />
                {!collapsed && "Admin"}
              </Link>
            </NavTooltip>
          )}
          {mounted && supportUrl && (
            <NavTooltip label="Support this server" collapsed={collapsed}>
              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                  collapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2 py-1.5"
                )}
              >
                <Coffee className="h-4 w-4 shrink-0" />
                {!collapsed && "Support this server"}
              </a>
            </NavTooltip>
          )}
          {collapsed ? (
            <div className="flex flex-col items-center gap-0.5">
              <NavTooltip label="Sign out" collapsed={collapsed}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </NavTooltip>
              <ThemeToggle />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                className="flex-1 justify-start gap-3 px-2 py-1.5 text-sm font-medium text-muted-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
              <ThemeToggle />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
