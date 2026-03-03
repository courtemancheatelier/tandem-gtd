import { Server, Settings, Inbox, UserPlus, ListChecks } from "lucide-react";
import type { BrandingData } from "@/lib/branding";

const flagshipSteps = [
  {
    icon: Server,
    number: "1",
    title: "Deploy",
    description:
      "Clone the repo, configure your database, and start the server. Docker and bare-metal setups both supported.",
  },
  {
    icon: Settings,
    number: "2",
    title: "Configure",
    description:
      "Set up authentication, invite your team, and customize contexts, areas, and AI integrations from the admin panel.",
  },
  {
    icon: Inbox,
    number: "3",
    title: "Capture",
    description:
      "Start dumping everything into your inbox. Tandem helps you clarify, organize, and review \u2014 the GTD way.",
  },
];

const operatorSteps = [
  {
    icon: UserPlus,
    number: "1",
    title: "Sign Up",
    description:
      "Create your account and complete the onboarding wizard to set up your personal GTD system.",
  },
  {
    icon: ListChecks,
    number: "2",
    title: "Set Up",
    description:
      "Configure your contexts, areas of focus, and horizons. Make the system yours.",
  },
  {
    icon: Inbox,
    number: "3",
    title: "Start Capturing",
    description:
      "Dump everything into your inbox. Clarify, organize, and review \u2014 the GTD way.",
  },
];

export function HowItWorks({ branding }: { branding: BrandingData }) {
  const steps =
    branding.landingMode === "FLAGSHIP" ? flagshipSteps : operatorSteps;

  return (
    <section className="border-t bg-muted/50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in minutes
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Three steps from zero to a fully functional GTD system.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <step.icon className="h-7 w-7 text-primary" />
              </div>
              <div className="mt-1 text-xs font-medium text-muted-foreground">
                Step {step.number}
              </div>
              <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
