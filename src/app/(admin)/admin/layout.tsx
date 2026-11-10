import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { InsetShell, type NavGroup } from "@/components/shell/inset-shell";
import { AdminAccountMenu } from "@/components/admin/admin-account-menu";
import { BrandLogo } from "@/components/brand-logo";
import { Toaster } from "@/components/ui/sonner";
import { adminBadgeCounts } from "@/lib/admin-counts";
import { requireAdmin } from "@/lib/session";

// The whole /admin tree is per-request, RBAC-gated, and uncacheable.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Server-side RBAC gate for the entire /admin tree.
  const admin = await requireAdmin();
  const counts = await adminBadgeCounts();

  const groups: NavGroup[] = [
    { items: [{ href: "/admin", label: "Dashboard", icon: "dashboard", exact: true }] },
    { label: "Sales", items: [
      { href: "/admin/orders", label: "Orders", icon: "orders" },
      { href: "/admin/payments", label: "Payments", icon: "payments", badge: counts.pendingPayments },
      { href: "/admin/reviews", label: "Reviews", icon: "reviews", badge: counts.pendingReviews },
    ] },
    { label: "Catalog", items: [{ href: "/admin/products", label: "Products", icon: "products" }] },
    { label: "Site", items: [{ href: "/admin/content", label: "Landing page", icon: "content" }] },
  ];

  return (
    <>
      <InsetShell
        density="compact"
        rootLabel="Admin"
        labels={{ new: "New", payments: "Payments", content: "Landing page", acknowledgment: "Acknowledgment" }}
        brand={
          <Link href="/admin" className="flex items-center gap-2" aria-label="Admin home">
            <BrandLogo variant="icon" className="h-7" />
            <span className="text-sm font-extrabold tracking-tight">Admin</span>
          </Link>
        }
        groups={groups}
        topbarRight={<AdminAccountMenu variant="avatar" name={admin.name} email={admin.email} image={admin.image ?? null} />}
        sidebarFooter={
          <div className="space-y-1 text-xs">
            <Link href="/" target="_blank" className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-sidebar-foreground/80 hover:bg-background/60">
              <ExternalLink className="size-3.5" aria-hidden /> View storefront
            </Link>
            <AdminAccountMenu variant="sidebar" name={admin.name} email={admin.email} image={admin.image ?? null} />
          </div>
        }
      >
        {children}
      </InsetShell>
      <Toaster richColors position="top-center" />
    </>
  );
}
