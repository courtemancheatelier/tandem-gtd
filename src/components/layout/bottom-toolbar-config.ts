import {
  Zap,
  Inbox,
  FolderKanban,
  LayoutDashboard,
  FileText,
  BookOpen,
  RotateCcw,
  Clock,
  Lightbulb,
  Layers,
  Mountain,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ToolbarItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

export const AVAILABLE_TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: "do-now", href: "/do-now", label: "Do Now", icon: Zap },
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "inbox", href: "/inbox", label: "Inbox", icon: Inbox },
  { id: "projects", href: "/projects", label: "Projects", icon: FolderKanban },
  { id: "outline", href: "/projects/outline", label: "Outline", icon: FileText },
  { id: "wiki", href: "/wiki", label: "Wiki", icon: BookOpen },
  { id: "review", href: "/review", label: "Review", icon: RotateCcw },
  { id: "waiting-for", href: "/waiting-for", label: "Waiting", icon: Clock },
  { id: "someday", href: "/someday", label: "Someday", icon: Lightbulb },
  { id: "areas", href: "/areas", label: "Areas", icon: Layers },
  { id: "horizons", href: "/horizons", label: "Horizons", icon: Mountain },
  { id: "insights", href: "/insights", label: "Insights", icon: BarChart3 },
];

export const DEFAULT_TOOLBAR_IDS = ["inbox", "do-now", "projects", "dashboard"];
export const MAX_TOOLBAR_ITEMS = 6;

const STORAGE_KEY = "tandem-toolbar-config";

export function getToolbarConfig(): string[] {
  if (typeof window === "undefined") return DEFAULT_TOOLBAR_IDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOOLBAR_IDS;
    const ids: string[] = JSON.parse(raw);
    // Validate that all IDs are known
    const valid = ids.filter((id) =>
      AVAILABLE_TOOLBAR_ITEMS.some((item) => item.id === id)
    );
    return valid.length > 0 ? valid.slice(0, MAX_TOOLBAR_ITEMS) : DEFAULT_TOOLBAR_IDS;
  } catch {
    return DEFAULT_TOOLBAR_IDS;
  }
}

export function saveToolbarConfig(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_TOOLBAR_ITEMS)));
    window.dispatchEvent(new CustomEvent("toolbar-config-changed"));
  } catch {
    // localStorage unavailable
  }
}

export function resolveToolbarItems(ids: string[]): ToolbarItem[] {
  return ids
    .map((id) => AVAILABLE_TOOLBAR_ITEMS.find((item) => item.id === id))
    .filter((item): item is ToolbarItem => item != null);
}
