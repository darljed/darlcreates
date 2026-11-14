import Link from "next/link";
import { Boxes, Gift, Heart, Package, Palette, Printer, Rocket, ShieldCheck, Sparkles, Star, Truck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconName } from "@/lib/site-content-schema";

/** Admin-picked icon names -> components. Typed so adding a name to the schema forces an entry here. */
export const ICONS: Record<IconName, LucideIcon> = {
  Boxes, Palette, Rocket, Sparkles, Truck, Heart, ShieldCheck, Star, Zap, Package, Gift, Printer,
};

/**
 * Link for CMS-managed targets (already validated by `isSafeHref` on save). Same-site paths and
 * anchors use next/link; anything else opens as an external link.
 */
export function CmsLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/i.test(href);
  return (
    <a href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}
