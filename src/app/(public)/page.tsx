import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { BRANDING_DEFAULTS, BRANDING_SELECT } from "@/lib/branding";
import type { BrandingData } from "@/lib/branding";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PhilosophySection } from "@/components/landing/PhilosophySection";
import { ManagedHostingCallout } from "@/components/landing/ManagedHostingCallout";
import { CTASection } from "@/components/landing/CTASection";
import { LandingFooter } from "@/components/landing/LandingFooter";

export async function generateMetadata() {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { instanceName: true, instanceTagline: true, landingMode: true },
  });

  const name = settings?.instanceName ?? "Tandem GTD";
  const tagline =
    settings?.instanceTagline ??
    "A self-hosted GTD app that actually does GTD.";
  const isFlagship = settings?.landingMode === "FLAGSHIP";

  const title = isFlagship
    ? `${name} - Self-Hosted Getting Things Done`
    : name;
  const description = isFlagship
    ? "GTD deserves better software. Tandem implements all of it — cascade engine, contexts, horizons, weekly review, and teams — on infrastructure you control."
    : tagline;

  return {
    title,
    description,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function LandingPage() {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const isBeta = host.startsWith("beta.");

  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { landingEnabled: true, ...BRANDING_SELECT },
  });

  if (settings && !settings.landingEnabled) {
    redirect("/login");
  }

  const branding: BrandingData = settings
    ? {
        landingMode: settings.landingMode,
        instanceName: settings.instanceName,
        instanceTagline: settings.instanceTagline,
        instanceDesc: settings.instanceDesc,
        instanceLogoUrl: settings.instanceLogoUrl,
        accentColor: settings.accentColor,
        operatorName: settings.operatorName,
        operatorUrl: settings.operatorUrl,
        heroHeading: settings.heroHeading,
        heroDescription: settings.heroDescription,
        featureHighlights: settings.featureHighlights,
        ctaHeading: settings.ctaHeading,
        ctaDescription: settings.ctaDescription,
        ctaButtonText: settings.ctaButtonText,
        ctaButtonUrl: settings.ctaButtonUrl,
        supportUrl: settings.supportUrl,
        registrationMode: settings.registrationMode,
      }
    : BRANDING_DEFAULTS;

  const isRegistrationOpen = branding.registrationMode !== "CLOSED";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav branding={branding} isBeta={isBeta} />
      <main>
        <HeroSection branding={branding} showSignup={isRegistrationOpen} isBeta={isBeta} />
        <FeaturesGrid branding={branding} />
        <PhilosophySection branding={branding} />
        <ManagedHostingCallout branding={branding} />
        <HowItWorks branding={branding} />
        <CTASection branding={branding} showSignup={isRegistrationOpen} isBeta={isBeta} />
      </main>
      <LandingFooter branding={branding} isBeta={isBeta} />
    </div>
  );
}
