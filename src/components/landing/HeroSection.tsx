import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmailSignup } from "@/components/landing/EmailSignup";
import type { BrandingData } from "@/lib/branding";

export function HeroSection({
  branding,
  showSignup,
  isBeta,
}: {
  branding: BrandingData;
  showSignup: boolean;
  isBeta: boolean;
}) {
  const isFlagship = branding.landingMode === "FLAGSHIP";
  const isTrial = branding.registrationMode === "TRIAL";
  const isPublicFlagship = !isBeta && isFlagship && branding.registrationMode !== "OPEN" && !isTrial;

  const heading =
    branding.heroHeading ??
    (isFlagship
      ? "Your GTD system, your hardware, your rules."
      : branding.instanceName);

  const description =
    branding.heroDescription ??
    (isFlagship
      ? "Tandem exists because GTD deserves better software. Every workflow maps to David Allen\u2019s methodology \u2014 on infrastructure you control."
      : branding.instanceTagline);

  return (
    <section className="py-20 sm:py-28 lg:py-36">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          {heading}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          {description}
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {isPublicFlagship ? (
            <>
              <p className="w-full text-sm text-muted-foreground sm:w-auto">
                Get notified when Tandem launches publicly.
              </p>
              <EmailSignup />
            </>
          ) : (
            <>
              {showSignup && (
                <Button size="lg" asChild>
                  <Link href="/login">
                    {isTrial ? "Try Tandem Free" : "Get Started"}
                  </Link>
                </Button>
              )}
              {!showSignup && !isFlagship && (
                <Button size="lg" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="lg" asChild>
            <a
              href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/courtemancheatelier/tandem-gtd"}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
