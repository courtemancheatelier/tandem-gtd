import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { instanceName: true },
  });

  const instanceName = settings?.instanceName ?? "Tandem GTD";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link href="/" className="text-lg font-semibold hover:opacity-80 transition-opacity">
            {instanceName}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {children}
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-6">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/" className="hover:text-foreground transition-colors">
              Back to {instanceName}
            </Link>
          </div>
          <p>&copy; {new Date().getFullYear()} <a href="https://www.courtemancheatelier.studio/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-2">Courtemanche Atelier LLC</a>. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
