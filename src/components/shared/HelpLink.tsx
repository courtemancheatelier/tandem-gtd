import Link from "next/link";
import { HelpCircle } from "lucide-react";

export function HelpLink({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <Link
      href={`/help/${slug}`}
      className={`text-muted-foreground/40 hover:text-muted-foreground transition-colors ${className ?? ""}`}
    >
      <HelpCircle className="h-4 w-4" />
    </Link>
  );
}
