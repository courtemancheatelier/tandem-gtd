import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Workflow,
  MapPin,
  Layers,
  CalendarCheck,
  UsersRound,
  Code,
  Zap,
  Target,
  Mountain,
  ClipboardCheck,
  LockOpen,
  Inbox,
  Settings,
  Server,
  FolderKanban,
  type LucideIcon,
} from "lucide-react";
import type { BrandingData } from "@/lib/branding";

const ICON_MAP: Record<string, LucideIcon> = {
  workflow: Workflow,
  "map-pin": MapPin,
  layers: Layers,
  "calendar-check": CalendarCheck,
  "users-round": UsersRound,
  code: Code,
  zap: Zap,
  target: Target,
  mountain: Mountain,
  "clipboard-check": ClipboardCheck,
  "lock-open": LockOpen,
  inbox: Inbox,
  settings: Settings,
  server: Server,
  "folder-kanban": FolderKanban,
};

const defaultFeatures = [
  {
    icon: Workflow,
    title: "Cascade Engine",
    description:
      "Automatic task promotion through sequential projects. Complete a task and the next one surfaces instantly.",
  },
  {
    icon: MapPin,
    title: "Context Views",
    description:
      'Filter your next actions by context \u2014 @Home, @Computer, @Office \u2014 so you always see what you can do right now.',
  },
  {
    icon: Layers,
    title: "Horizons of Focus",
    description:
      "From runway actions to life purpose. Align daily tasks with goals, areas of responsibility, and long-term vision.",
  },
  {
    icon: CalendarCheck,
    title: "Weekly Review",
    description:
      "Guided weekly review with step-by-step checklists. Keep your system current and your mind clear.",
  },
  {
    icon: UsersRound,
    title: "Teams",
    description:
      "Shared projects with task assignment, delegation, and waiting-for tracking. GTD that scales to your team.",
  },
  {
    icon: Code,
    title: "Open Source",
    description:
      "AGPL-3.0 licensed. Inspect the code, contribute improvements, and run it on your own infrastructure.",
  },
];

interface CustomFeature {
  title: string;
  description: string;
  icon: string;
}

function parseFeatureHighlights(json: string | null): CustomFeature[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    // Validate each item has title & description
    for (const item of parsed) {
      if (typeof item.title !== "string" || typeof item.description !== "string") {
        return null;
      }
    }
    return parsed.slice(0, 6) as CustomFeature[];
  } catch {
    return null;
  }
}

export function FeaturesGrid({ branding }: { branding: BrandingData }) {
  const customFeatures = parseFeatureHighlights(branding.featureHighlights);

  const features = customFeatures
    ? customFeatures.map((f) => ({
        icon: ICON_MAP[f.icon.toLowerCase()] ?? Zap,
        title: f.title,
        description: f.description,
      }))
    : defaultFeatures;

  return (
    <section className="border-t bg-muted/50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to get things done
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Built from the ground up around David Allen&apos;s GTD methodology
            &mdash; not bolted on as an afterthought.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="mb-2 h-8 w-8 text-primary" />
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
