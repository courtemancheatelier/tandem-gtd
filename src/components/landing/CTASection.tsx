import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmailSignup } from "@/components/landing/EmailSignup";
import type { BrandingData } from "@/lib/branding";

export function CTASection({
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
    branding.ctaHeading ?? "Ready to get things done?";
  const description =
    branding.ctaDescription ??
    "Stop fighting your tools. Start a system that works the way your mind does.";
  const buttonText = branding.ctaButtonText ?? (isTrial ? "Try Tandem Free" : "Get Started");
  const buttonUrl = branding.ctaButtonUrl ?? "/login";
  const isExternal = buttonUrl.startsWith("http");

  return (
    <section className="border-t py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {heading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          {description}
        </p>
        <div className="mt-8">
          {isPublicFlagship ? (
            <EmailSignup />
          ) : showSignup ? (
            isExternal ? (
              <Button size="lg" asChild>
                <a
                  href={buttonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {buttonText}
                </a>
              </Button>
            ) : (
              <Button size="lg" asChild>
                <Link href={buttonUrl}>{buttonText}</Link>
              </Button>
            )
          ) : (
            <Button size="lg" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
