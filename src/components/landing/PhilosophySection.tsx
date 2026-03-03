import { BookOpen, HardDrive, Bot, LockOpen } from "lucide-react";
import type { BrandingData } from "@/lib/branding";

const principles = [
  {
    icon: BookOpen,
    title: "The methodology is the product.",
    description:
      "Tandem doesn\u2019t just borrow GTD vocabulary. Cascade engine, horizons, contexts, weekly review \u2014 every workflow maps to Allen\u2019s model because the model works.",
  },
  {
    icon: HardDrive,
    title: "Your data is yours.",
    description:
      "Self-hosted means your tasks, projects, and notes never leave hardware you control. No cloud lock-in, no surprise shutdowns.",
  },
  {
    icon: Bot,
    title: "AI assists, never decides.",
    description:
      "Tanda suggests clarifications and surfaces patterns, but every action stays in your hands. Automation you can trust because you stay in the loop.",
  },
  {
    icon: LockOpen,
    title: "Open source, no tiers.",
    description:
      "AGPL-3.0 licensed. Every feature ships to everyone. Inspect the code, contribute improvements, run it forever.",
  },
];

export function PhilosophySection({ branding }: { branding: BrandingData }) {
  if (branding.landingMode !== "FLAGSHIP") return null;

  return (
    <section className="border-t py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Why Tandem exists
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Built for people who take GTD seriously &mdash; or want to.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {principles.map((p) => (
            <div key={p.title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
