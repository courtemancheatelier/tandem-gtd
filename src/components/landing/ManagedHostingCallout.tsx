import { Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandingData } from "@/lib/branding";

export function ManagedHostingCallout({
  branding,
}: {
  branding: BrandingData;
}) {
  if (branding.landingMode !== "FLAGSHIP") return null;

  return (
    <section className="border-t py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border bg-card p-8 sm:p-10 flex flex-col sm:flex-row items-start gap-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Cloud className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">
              Don&apos;t want to manage a server?
            </h3>
            <p className="text-muted-foreground">
              We&apos;ll do it for you. Tandem managed hosting includes setup,
              updates, backups, and support &mdash; so your team gets a full GTD
              system without touching a terminal. Starting at $500/year for
              nonprofits.
            </p>
            <Button variant="outline" asChild>
              <a
                href="https://manage.tandemgtd.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                See hosting plans &rarr;
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
