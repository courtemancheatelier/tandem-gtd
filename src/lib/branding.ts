export interface BrandingData {
  landingMode: "FLAGSHIP" | "OPERATOR";
  instanceName: string;
  instanceTagline: string;
  instanceDesc: string | null;
  instanceLogoUrl: string | null;
  accentColor: string;
  operatorName: string | null;
  operatorUrl: string | null;
  heroHeading: string | null;
  heroDescription: string | null;
  featureHighlights: string | null;
  ctaHeading: string | null;
  ctaDescription: string | null;
  ctaButtonText: string | null;
  ctaButtonUrl: string | null;
  supportUrl: string | null;
  registrationMode: "CLOSED" | "WAITLIST" | "INVITE_ONLY" | "OPEN" | "TRIAL";
}

export const BRANDING_DEFAULTS: BrandingData = {
  landingMode: "OPERATOR",
  instanceName: "Tandem GTD",
  instanceTagline: "A self-hosted GTD app that actually does GTD.",
  instanceDesc: null,
  instanceLogoUrl: null,
  accentColor: "#6366f1",
  operatorName: null,
  operatorUrl: null,
  heroHeading: null,
  heroDescription: null,
  featureHighlights: null,
  ctaHeading: null,
  ctaDescription: null,
  ctaButtonText: null,
  ctaButtonUrl: null,
  supportUrl: null,
  registrationMode: "WAITLIST",
};

/** Fields to select from ServerSettings for branding */
export const BRANDING_SELECT = {
  landingMode: true,
  instanceName: true,
  instanceTagline: true,
  instanceDesc: true,
  instanceLogoUrl: true,
  accentColor: true,
  operatorName: true,
  operatorUrl: true,
  heroHeading: true,
  heroDescription: true,
  featureHighlights: true,
  ctaHeading: true,
  ctaDescription: true,
  ctaButtonText: true,
  ctaButtonUrl: true,
  supportUrl: true,
  registrationMode: true,
} as const;
