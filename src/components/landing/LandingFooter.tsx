import Link from "next/link";
import type { BrandingData } from "@/lib/branding";

export function LandingFooter({
  branding,
  isBeta,
}: {
  branding: BrandingData;
  isBeta: boolean;
}) {
  const isFlagship = branding.landingMode === "FLAGSHIP";
  const isTrial = branding.registrationMode === "TRIAL";
  const isPublicFlagship = !isBeta && isFlagship && branding.registrationMode !== "OPEN" && !isTrial;
  const year = new Date().getFullYear();

  return (
    <footer className="border-t py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            {!isPublicFlagship && (
              <Link href="/login" className="hover:text-foreground transition-colors">
                Log in
              </Link>
            )}
            <a
              href={process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/courtemancheatelier/tandem-gtd"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            {branding.supportUrl && (
              <a
                href={branding.supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Support{isFlagship ? " the development" : " this server"}
              </a>
            )}
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            {!isFlagship && branding.operatorName && (
              branding.operatorUrl ? (
                <a
                  href={branding.operatorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  {branding.operatorName}
                </a>
              ) : (
                <span>{branding.operatorName}</span>
              )
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {isFlagship ? (
              <p>&copy; {year} <a href="https://www.courtemancheatelier.studio/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-2">Courtemanche Atelier LLC</a>. All rights reserved.</p>
            ) : (
              <p>
                Powered by{" "}
                <a
                  href="https://tandemgtd.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Tandem GTD
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
