"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import type { BrandingData } from "@/lib/branding";

export function LandingNav({
  branding,
  isBeta,
}: {
  branding: BrandingData;
  isBeta: boolean;
}) {
  const isFlagship = branding.landingMode === "FLAGSHIP";
  const isTrial = branding.registrationMode === "TRIAL";
  const isPublicFlagship = !isBeta && isFlagship && branding.registrationMode !== "OPEN" && !isTrial;
  const showGetStarted = branding.registrationMode !== "CLOSED";

  return (
    <div className="sticky top-0 z-50">
      <div className="block bg-primary px-4 py-1.5 text-center text-sm text-primary-foreground">
        {isFlagship
          ? isPublicFlagship
            ? "Tandem is currently in private beta — sign up to get notified when we launch publicly."
            : isTrial
            ? "Try Tandem free — no credit card required."
            : "Tandem is currently in beta — actively developed with new features shipping regularly."
          : branding.instanceTagline}
      </div>
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            {branding.instanceLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.instanceLogoUrl}
                alt={branding.instanceName}
                className="h-7 w-7 object-contain"
              />
            )}
            {isFlagship ? "Tandem GTD\u2122" : branding.instanceName}
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a
                href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/courtemancheatelier/tandem-gtd"}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </Button>
            <ThemeToggle />
            {!isPublicFlagship && (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                {showGetStarted && (
                  <Button size="sm" asChild>
                    <Link href="/login">
                      {isTrial ? "Try Free" : "Get Started"}
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
