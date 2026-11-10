import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Friendly 404 body, styled with the site's own tokens. Next's built-in 404 page forces a plain
 * white/black body and text colour (and switches to black in dark-mode browsers), which clashes with the
 * theme and hides text. Every route group has a not-found.tsx that renders this inside its own layout.
 */
export function NotFoundView({
  title = "We couldn't find that page",
  message = "The link may be old, or the page may have moved. Let's get you back on track.",
  primary = { href: "/products", label: "Browse the shop" },
  secondary = { href: "/", label: "Go to the home page" },
}: {
  title?: string;
  message?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p aria-hidden className="text-7xl font-extrabold tracking-tight text-primary">404</p>
        <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild className="bg-primary text-primary-foreground">
            <Link href={primary.href}>
              <Compass className="mr-1 size-4" /> {primary.label}
            </Link>
          </Button>
          {secondary && (
            <Button asChild variant="outline">
              <Link href={secondary.href}>
                <ArrowLeft className="mr-1 size-4" /> {secondary.label}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
