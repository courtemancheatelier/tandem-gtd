import {
  Zap,
  Battery,
  ShoppingBag,
  Bookmark,
  Clock,
  Home,
  Monitor,
  Phone,
  Briefcase,
  MapPin,
  type LucideIcon,
} from "lucide-react";

export interface QuickView {
  id: string;
  name: string;
  icon: string;
  params: Record<string, string>;
  color: string;
}

export const STORAGE_KEY = "tandem-quick-views";

export const defaultQuickViews: QuickView[] = [
  { id: "1", name: "Quick Wins", icon: "Zap", params: { maxTime: "15" }, color: "#f59e0b" },
  { id: "2", name: "Low Energy", icon: "Battery", params: { energy: "LOW" }, color: "#6366f1" },
  { id: "3", name: "Errands", icon: "ShoppingBag", params: { context: "@errands" }, color: "#10b981" },
];

export const iconMap: Record<string, LucideIcon> = {
  Zap,
  Battery,
  ShoppingBag,
  Bookmark,
  Clock,
  Home,
  Monitor,
  Phone,
  Briefcase,
  MapPin,
};

export function getQuickViewsFromStorage(): QuickView[] {
  if (typeof window === "undefined") return defaultQuickViews;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return defaultQuickViews;
}

export function saveQuickViewsToStorage(views: QuickView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}
