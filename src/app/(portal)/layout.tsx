import { Suspense } from "react";
import Link from "next/link";
import { InsetShell, type NavGroup } from "@/components/shell/inset-shell";
import { BrandLogo } from "@/components/brand-logo";
import { PortalUser } from "@/components/portal-user";
import { Toaster } from "@/components/ui/sonner";

// The customer area is per-user. Pages guard themselves with requireUser(where) so a signed-out
// visitor returns to the page they asked for after signing in.
export const instant = false;

const GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/orders", label: "My orders", icon: "orders" },
      { href: "/account", label: "My account", icon: "account" },
    ],
  },
  {
    label: "Shop",
    items: [
      { href: "/products", label: "Browse products", icon: "store" },
      { href: "/cart", label: "Cart", icon: "cart" },
    ],
  },
];

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <InsetShell
        density="comfortable"
        rootLabel="Darl Creates"
        rootless
        labels={{ orders: "Orders", account: "Account", acknowledgment: "Acknowledgment" }}
        brand={
          <Link href="/" aria-label="Darl Creates home" className="block">
            <BrandLogo variant="horizontal" className="h-8" />
          </Link>
        }
        groups={GROUPS}
        topbarRight={
          <Suspense fallback={<div className="size-9" aria-hidden />}>
            <PortalUser />
          </Suspense>
        }
        sidebarFooter={
          <Link href="/" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground/80 hover:bg-background/60">
            ← Back to home
          </Link>
        }
      >
        {children}
      </InsetShell>
      <Toaster richColors position="top-center" />
    </>
  );
}
